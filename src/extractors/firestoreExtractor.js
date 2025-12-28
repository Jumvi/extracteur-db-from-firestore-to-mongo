const admin = require('firebase-admin');

class FirestoreExtractor {
  constructor(serviceAccountPath) {
    // Initialiser Firebase Admin
    const serviceAccount = require(serviceAccountPath);
    
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
    
    this.db = admin.firestore();
  }

  /**
   * Récupère la liste de toutes les collections
   */
  async getCollections() {
    try {
      const collections = await this.db.listCollections();
      return collections.map(col => col.id);
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des collections:', error);
      throw error;
    }
  }

  /**
   * Récupère tous les documents d'une collection avec pagination
   */
  async getDocumentsFromCollection(collectionName, batchSize = 500) {
    try {
      const documents = [];
      let lastDoc = null;
      let hasMore = true;

      console.log(`📥 Extraction de la collection: ${collectionName}`);

      while (hasMore) {
        let query = this.db.collection(collectionName).limit(batchSize);
        
        if (lastDoc) {
          query = query.startAfter(lastDoc);
        }

        const snapshot = await query.get();

        if (snapshot.empty) {
          hasMore = false;
          break;
        }

        for (const doc of snapshot.docs) {
          const data = doc.data();
          
          // Récupérer les sous-collections
          const subCollections = await this.getSubcollections(doc.ref);
          
          documents.push({
            _id: doc.id,
            ...data,
            _subcollections: subCollections.length > 0 ? subCollections : undefined
          });
        }

        lastDoc = snapshot.docs[snapshot.docs.length - 1];
        
        if (snapshot.docs.length < batchSize) {
          hasMore = false;
        }

        console.log(`   ⏳ ${documents.length} documents extraits...`);
      }

      console.log(`   ✓ ${documents.length} documents extraits de ${collectionName}`);
      return documents;

    } catch (error) {
      console.error(`❌ Erreur lors de l'extraction de ${collectionName}:`, error);
      throw error;
    }
  }

  /**
   * Récupère les sous-collections d'un document
   */
  async getSubcollections(docRef) {
    try {
      const subcollections = await docRef.listCollections();
      const result = [];

      for (const subcol of subcollections) {
        const subcolName = subcol.id;
        const subDocs = [];
        
        const snapshot = await subcol.get();
        
        for (const subDoc of snapshot.docs) {
          const subDocData = subDoc.data();
          subDocs.push({
            _id: subDoc.id,
            ...subDocData
          });
        }

        if (subDocs.length > 0) {
          result.push({
            name: subcolName,
            documents: subDocs
          });
        }
      }

      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des sous-collections:', error);
      return [];
    }
  }

  /**
   * Extrait toutes les données de Firestore
   */
  async extractAll(batchSize = 500) {
    try {
      const collections = await this.getCollections();
      console.log(`📊 ${collections.length} collection(s) trouvée(s): ${collections.join(', ')}`);

      const allData = {};

      for (const collectionName of collections) {
        const documents = await this.getDocumentsFromCollection(collectionName, batchSize);
        allData[collectionName] = documents;
      }

      return allData;
    } catch (error) {
      console.error('❌ Erreur lors de l\'extraction complète:', error);
      throw error;
    }
  }

  /**
   * Ferme la connexion
   */
  async close() {
    await admin.app().delete();
  }
}

module.exports = FirestoreExtractor;
