require('dotenv').config();
const path = require('path');
const FirestoreExtractor = require('./extractors/firestoreExtractor');
const DataTransformer = require('./transformers/dataTransformer');
const MongoLoader = require('./loaders/mongoLoader');

class FirestoreToMongoETL {
  constructor() {
    // Configuration depuis les variables d'environnement
    this.config = {
      firebaseKeyPath: process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './config/firebase-key.json',
      mongoUri: process.env.MONGODB_URI,
      mongoDatabaseName: process.env.MONGODB_DATABASE,
      batchSize: parseInt(process.env.BATCH_SIZE) || 500,
      logLevel: process.env.LOG_LEVEL || 'info'
    };

    this.validateConfig();
  }

  /**
   * Valide la configuration
   */
  validateConfig() {
    if (!this.config.mongoUri) {
      throw new Error('MONGODB_URI est requis dans le fichier .env');
    }

    if (!this.config.mongoDatabaseName) {
      throw new Error('MONGODB_DATABASE est requis dans le fichier .env');
    }

    // Convertir le chemin relatif en chemin absolu
    if (!path.isAbsolute(this.config.firebaseKeyPath)) {
      this.config.firebaseKeyPath = path.join(process.cwd(), this.config.firebaseKeyPath);
    }

    console.log('✓ Configuration validée');
  }

  /**
   * Affiche le résumé de la configuration
   */
  displayConfig() {
    console.log('\n📋 Configuration:');
    console.log(`   Firebase: ${this.config.firebaseKeyPath}`);
    console.log(`   MongoDB: ${this.config.mongoDatabaseName}`);
    console.log(`   Batch Size: ${this.config.batchSize}`);
    console.log('');
  }

  /**
   * Execute la migration complète
   */
  async migrate() {
    const startTime = Date.now();
    let extractor = null;
    let loader = null;

    try {
      console.log('🚀 Démarrage de la migration Firestore → MongoDB\n');
      this.displayConfig();

      // 1. EXTRACTION
      console.log('📥 Phase 1: EXTRACTION depuis Firestore');
      console.log('═'.repeat(50));
      
      extractor = new FirestoreExtractor(this.config.firebaseKeyPath);
      const firestoreData = await extractor.extractAll(this.config.batchSize);

      const totalDocs = Object.values(firestoreData).reduce((sum, docs) => sum + docs.length, 0);
      console.log(`\n✓ Extraction terminée: ${totalDocs} document(s) total\n`);

      // 2. TRANSFORMATION
      console.log('🔄 Phase 2: TRANSFORMATION des données');
      console.log('═'.repeat(50));
      
      const transformedData = DataTransformer.transformCollections(firestoreData);
      console.log('\n✓ Transformation terminée\n');

      // 3. CHARGEMENT
      console.log('📤 Phase 3: CHARGEMENT dans MongoDB');
      console.log('═'.repeat(50));
      
      loader = new MongoLoader(this.config.mongoUri, this.config.mongoDatabaseName);
      await loader.connect();

      const stats = await loader.loadAll(transformedData, this.config.batchSize);

      // 4. STATISTIQUES FINALES
      console.log('\n' + '═'.repeat(50));
      console.log('✅ MIGRATION TERMINÉE AVEC SUCCÈS!');
      console.log('═'.repeat(50));

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);

      console.log('\n📈 Statistiques de migration:');
      console.log(`   Durée totale: ${duration}s`);
      console.log(`   Documents total: ${stats.total}`);
      console.log(`   Documents insérés: ${stats.inserted}`);
      console.log(`   Erreurs: ${stats.errors}`);
      console.log('\n📊 Par collection:');

      for (const [name, colStats] of Object.entries(stats.collections)) {
        const status = colStats.errors === 0 ? '✓' : '⚠️';
        console.log(`   ${status} ${name}: ${colStats.inserted}/${colStats.total} documents`);
      }

      // Vérification finale
      console.log('\n🔍 Vérification finale dans MongoDB:');
      const mongoStats = await loader.getAllStats();
      
      for (const stat of mongoStats) {
        console.log(`   ${stat.name}: ${stat.count} document(s)`);
      }

      console.log('\n✨ Migration complétée!\n');

    } catch (error) {
      console.error('\n❌ ERREUR LORS DE LA MIGRATION:');
      console.error(error);
      process.exit(1);
    } finally {
      // Nettoyage
      if (extractor) {
        await extractor.close();
      }
      if (loader) {
        await loader.close();
      }
    }
  }
}

// Exécution du script
async function main() {
  try {
    const etl = new FirestoreToMongoETL();
    await etl.migrate();
  } catch (error) {
    console.error('❌ Erreur fatale:', error.message);
    process.exit(1);
  }
}

// Lancer la migration si ce fichier est exécuté directement
if (require.main === module) {
  main();
}

module.exports = FirestoreToMongoETL;
