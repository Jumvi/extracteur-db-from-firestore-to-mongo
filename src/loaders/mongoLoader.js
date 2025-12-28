const { MongoClient } = require('mongodb');

class MongoLoader {
  constructor(uri, databaseName) {
    this.uri = uri;
    this.databaseName = databaseName;
    this.client = null;
    this.db = null;
  }

  /**
   * Connexion à MongoDB
   */
  async connect() {
    try {
      console.log('🔌 Connexion à MongoDB...');
      this.client = new MongoClient(this.uri);
      await this.client.connect();
      this.db = this.client.db(this.databaseName);
      console.log(`✓ Connecté à MongoDB: ${this.databaseName}`);
    } catch (error) {
      console.error('❌ Erreur de connexion à MongoDB:', error);
      throw error;
    }
  }

  /**
   * Vérifie si une collection existe
   */
  async collectionExists(collectionName) {
    const collections = await this.db.listCollections({ name: collectionName }).toArray();
    return collections.length > 0;
  }

  /**
   * Charge des documents dans une collection par batch
   */
  async loadDocuments(collectionName, documents, batchSize = 500) {
    try {
      if (!documents || documents.length === 0) {
        console.log(`   ⚠️  Aucun document à charger dans ${collectionName}`);
        return { inserted: 0, errors: 0 };
      }

      console.log(`📤 Chargement dans ${collectionName}: ${documents.length} document(s)`);

      const collection = this.db.collection(collectionName);
      let inserted = 0;
      let errors = 0;

      // Traiter par batch
      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);

        try {
          // Utiliser replaceOne avec upsert pour éviter les doublons
          const operations = batch.map(doc => ({
            replaceOne: {
              filter: { _id: doc._id },
              replacement: doc,
              upsert: true
            }
          }));

          const result = await collection.bulkWrite(operations, { ordered: false });
          inserted += result.upsertedCount + result.modifiedCount;

          console.log(`   ⏳ ${inserted}/${documents.length} document(s) chargé(s)...`);

        } catch (error) {
          console.error(`   ❌ Erreur lors du chargement du batch ${i}-${i + batch.length}:`, error.message);
          errors += batch.length;
        }
      }

      console.log(`   ✓ ${inserted} document(s) chargé(s) dans ${collectionName}`);

      if (errors > 0) {
        console.log(`   ⚠️  ${errors} erreur(s) rencontrée(s)`);
      }

      return { inserted, errors };

    } catch (error) {
      console.error(`❌ Erreur lors du chargement dans ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Charge toutes les collections
   */
  async loadAll(collections, batchSize = 500) {
    try {
      const stats = {
        total: 0,
        inserted: 0,
        errors: 0,
        collections: {}
      };

      for (const [collectionName, documents] of Object.entries(collections)) {
        const result = await this.loadDocuments(collectionName, documents, batchSize);
        
        stats.total += documents.length;
        stats.inserted += result.inserted;
        stats.errors += result.errors;
        stats.collections[collectionName] = {
          total: documents.length,
          inserted: result.inserted,
          errors: result.errors
        };
      }

      return stats;

    } catch (error) {
      console.error('❌ Erreur lors du chargement complet:', error);
      throw error;
    }
  }

  /**
   * Crée des index sur une collection
   */
  async createIndexes(collectionName, indexes) {
    try {
      if (!indexes || indexes.length === 0) {
        return;
      }

      console.log(`🔧 Création des index pour ${collectionName}...`);
      const collection = this.db.collection(collectionName);

      for (const index of indexes) {
        await collection.createIndex(index.keys, index.options || {});
        console.log(`   ✓ Index créé: ${JSON.stringify(index.keys)}`);
      }

    } catch (error) {
      console.error(`❌ Erreur lors de la création des index pour ${collectionName}:`, error);
    }
  }

  /**
   * Obtient les statistiques d'une collection
   */
  async getCollectionStats(collectionName) {
    try {
      const collection = this.db.collection(collectionName);
      const count = await collection.countDocuments();
      
      return {
        name: collectionName,
        count
      };
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des stats de ${collectionName}:`, error);
      return { name: collectionName, count: 0 };
    }
  }

  /**
   * Obtient les statistiques de toutes les collections
   */
  async getAllStats() {
    try {
      const collections = await this.db.listCollections().toArray();
      const stats = [];

      for (const col of collections) {
        const stat = await this.getCollectionStats(col.name);
        stats.push(stat);
      }

      return stats;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des statistiques:', error);
      return [];
    }
  }

  /**
   * Supprime une collection (utile pour réinitialiser)
   */
  async dropCollection(collectionName) {
    try {
      const exists = await this.collectionExists(collectionName);
      if (exists) {
        await this.db.collection(collectionName).drop();
        console.log(`🗑️  Collection ${collectionName} supprimée`);
      }
    } catch (error) {
      console.error(`❌ Erreur lors de la suppression de ${collectionName}:`, error);
    }
  }

  /**
   * Ferme la connexion MongoDB
   */
  async close() {
    try {
      if (this.client) {
        await this.client.close();
        console.log('✓ Connexion MongoDB fermée');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la fermeture de la connexion:', error);
    }
  }
}

module.exports = MongoLoader;
