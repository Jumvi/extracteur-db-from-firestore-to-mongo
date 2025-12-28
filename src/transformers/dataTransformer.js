const admin = require('firebase-admin');

class DataTransformer {
  /**
   * Transforme les données Firestore vers le format MongoDB
   */
  static transformDocument(doc) {
    if (!doc || typeof doc !== 'object') {
      return doc;
    }

    const transformed = {};

    for (const [key, value] of Object.entries(doc)) {
      // Ignorer les métadonnées internes
      if (key.startsWith('_') && key !== '_id' && key !== '_subcollections') {
        continue;
      }

      transformed[key] = this.transformValue(value);
    }

    return transformed;
  }

  /**
   * Transforme une valeur Firestore vers MongoDB
   */
  static transformValue(value) {
    // Null ou undefined
    if (value === null || value === undefined) {
      return value;
    }

    // Timestamp Firestore → Date MongoDB
    if (value instanceof admin.firestore.Timestamp) {
      return value.toDate();
    }

    // GeoPoint Firestore → Format GeoJSON
    if (value instanceof admin.firestore.GeoPoint) {
      return {
        type: 'Point',
        coordinates: [value.longitude, value.latitude]
      };
    }

    // DocumentReference → Chemin string
    if (value instanceof admin.firestore.DocumentReference) {
      return {
        _ref: value.path,
        _collection: value.parent.id,
        _id: value.id
      };
    }

    // Array
    if (Array.isArray(value)) {
      return value.map(item => this.transformValue(item));
    }

    // Object
    if (typeof value === 'object' && value.constructor === Object) {
      return this.transformDocument(value);
    }

    // Types primitifs (string, number, boolean)
    return value;
  }

  /**
   * Transforme un lot de documents
   */
  static transformBatch(documents) {
    return documents.map(doc => this.transformDocument(doc));
  }

  /**
   * Transforme toutes les collections
   */
  static transformCollections(collections) {
    const transformed = {};

    for (const [collectionName, documents] of Object.entries(collections)) {
      console.log(`🔄 Transformation de ${collectionName}...`);
      transformed[collectionName] = this.transformBatch(documents);
      console.log(`   ✓ ${documents.length} document(s) transformé(s)`);
    }

    return transformed;
  }

  /**
   * Prépare les sous-collections pour MongoDB
   * Option 1: Les garder en embedded documents
   * Option 2: Les créer comme collections séparées
   */
  static handleSubcollections(document, parentCollection, mode = 'embedded') {
    if (!document._subcollections || document._subcollections.length === 0) {
      return { main: document, subcollections: [] };
    }

    const subcollections = [];
    const mainDoc = { ...document };

    if (mode === 'embedded') {
      // Garder les sous-collections dans le document parent
      mainDoc._subcollections = document._subcollections.map(subcol => ({
        name: subcol.name,
        documents: subcol.documents.map(doc => this.transformDocument(doc))
      }));
    } else if (mode === 'separate') {
      // Créer des collections séparées
      for (const subcol of document._subcollections) {
        const collectionName = `${parentCollection}_${subcol.name}`;
        const docs = subcol.documents.map(doc => ({
          ...this.transformDocument(doc),
          _parentId: document._id,
          _parentCollection: parentCollection
        }));

        subcollections.push({
          name: collectionName,
          documents: docs
        });
      }

      // Supprimer les sous-collections du document principal
      delete mainDoc._subcollections;
    }

    return { main: mainDoc, subcollections };
  }

  /**
   * Valide un document transformé
   */
  static validateDocument(doc) {
    if (!doc) {
      throw new Error('Document invalide: null ou undefined');
    }

    if (typeof doc !== 'object') {
      throw new Error('Document invalide: pas un objet');
    }

    if (!doc._id) {
      throw new Error('Document invalide: _id manquant');
    }

    return true;
  }

  /**
   * Nettoie les documents avant insertion
   */
  static cleanDocument(doc) {
    const cleaned = { ...doc };

    // Supprimer les champs avec valeurs undefined
    Object.keys(cleaned).forEach(key => {
      if (cleaned[key] === undefined) {
        delete cleaned[key];
      }
    });

    return cleaned;
  }
}

module.exports = DataTransformer;
