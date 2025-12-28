# 🔄 Firestore to MongoDB ETL

[![Node.js](https://img.shields.io/badge/Node.js-16+-green.svg)](https://nodejs.org/)
[![Firebase](https://img.shields.io/badge/Firebase-Admin_SDK-orange.svg)](https://firebase.google.com/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6.0+-brightgreen.svg)](https://www.mongodb.com/)
[![License](https://img.shields.io/badge/license-ISC-blue.svg)](LICENSE)

Script ETL (Extract, Transform, Load) professionnel pour migrer vos données de **Firestore** vers **MongoDB** avec transformation automatique des types, gestion des sous-collections et rapports détaillés.

---

## 📋 Table des matières
Étape 1 : Clé de service Firebase

1. **Accédez à la [Console Firebase](https://console.firebase.google.com/)**
2. Sélectionnez votre projet
3. Cliquez sur l'icône ⚙️ → **Paramètres du projet**
4. Onglet **Comptes de service**
5. Cliquez sur **Générer une nouvelle clé privée**
6. **Sauvegardez** le fichier JSON téléchargé dans `config/firebase-key.json`

### Étape 2 : Configuration MongoDB Atlas

1. **Accédez à [MongoDB Atlas](https://cloud.mongodb.com/)**
2. **Network Access** → **Add IP Address** → **Allow Access from Anywhere** (ou votre IP)
3. **Database Access** → Créez un utilisateur avec permissions de lecture/écriture
4. **Database** → **Connect** → Copiez votre URI de connexion

### Étape 3 : Variables d'environnement

Copiez le fichier d'exemple et remplissez vos informations :

```bash
cp .env.example .env
```

Éditez `.env` :

```env
# Firebase Configuration
FIREBASE_SERVICE_ACCOUNT_PATH=./config/firebase-key.json

# MongoDB Configuration
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?retryWrites=true&w=majority
MONGODB_DATABASE=your_database_name

# Options de migration
BATCH_SIZE=500          # Taille des lots (500 recommandé)
LOG_LEVEL=info         # Niveau de logs (info, debug, error)
```

> ⚠️ **Important** : Ne commitez JAMAIS vos fichiers `.env` ou `firebase-key.json` sur Git ! **Chargement par batch** optimisé (configurable)
- ✅ **Idempotence** : relançable sans créer de doublons (upsert)
- ✅ **Gestion d'erreurs robuste** avec continuité du processus
- ✅ **Logs détaillés** et rapports statistiques
- ✅ **Validation des données** avant insertion

---

## 📦 Prérequis

- **Node.js** 16+ ([Télécharger](https://nodejs.org/))
- **Compte Firebase** avec accès Admin
- **Cluster MongoDB** (Atlas, local, ou autre)
- **Clés d'accès** pour les deux bases de données

---

## 🚀 Installation

```bash
# Cloner le repository
git clone <your-repo-url>
cd export-firestore-mongo

# Installer les dépendances
npm install
```

## ⚙️ Configuration

### 1. Clé de service Firebase

1. Allez sur la [Console Firebase](https://console.firebase.google.com/)
2. Sélectionnez votre projet
3. Allez dans **Paramètres du projet** > **Comptes de service**
4. Cliquez sur **Générer une nouvelle clé privée**
5. Enregistrez le fichier JSON téléchargé dans `config/firebase-key.json`

### 2. Variables d'environnement

Copiez `.env.example` vers `.env` et remplissez les valeurs :

```bash
cp .env.example .env
```
📄 .env                          # Configuration (à créer, non versionné)
├── 📄 .env.example                  # Template de configuration
├── 📄 .gitignore                    # Fichiers à ignorer
├── 📄 package.json                  # Dépendances Node.js
├── 📄 README.md                     # Documentation principale
├── 📄 DOCUMENTATION.md              # Documentation technique détaillée
│
├── 📁 config/
│   ├── firebase-key.json            # Clé Firebase (à ajouter, non versionné)
│   └── firebase-key.example.json   # Exemple de structure
│
└── 📁 src/
    ├── 📁 extractors/
    │   └── firestoreExtractor.js    # Module d'extraction Firestore
    ├── 📁 transformers/
    │   └── dataTransformer.js       # Module de transformation
    ├── 📁 loaders/
    │   └── mongoLoader.js           # Module de chargement MongoDB
    └── 📄 index.js                  # Orchestrateur principal (ETL)                     # Configuration (à créer)
├── .env.example                  # Exemple de configuration
├── config/ (recommandé)

```bash
npm start
# ou
npm run migrate
```

### Workflow du script

```mermaid
graph LR
    A[Firestore] -->|Extract| B[Extracteur]
    B --> C[Transformateur]
    C --> D[Loader]
    D -->|Load| E[MongoDB]
```

1. **Extraction** : Récupère toutes les collections et documents
2. **Transformation** : Convertit les types Firestore vers MongoDB
3. **Chargement** : Insère dans MongoDB par batch

Le script affiche la progression en temps réel avec statistiques détaillées.
```

oueffectue les conversions suivantes automatiquement :

| Type Firestore | Type MongoDB | Exemple |
|----------------|--------------|---------|
| **Document ID** | `_id` | `doc123` → `{ _id: "doc123" }` |
| **Timestamp** | `Date` | `Timestamp(2024, 1)` → `new Date("2024-01-01")` |
| **GeoPoint** | `GeoJSON Point` | `GeoPoint(48.8, 2.3)` → `{ type: "Point", coordinates: [2.3, 48.8] }` |
| *📝 Exemples de sortie

### Migration réussie

```
🚀 Démarrage de la migration Firestore → MongoDB

📋 Configuration:
   Firebase: /config/firebase-key.json
   MongoDB: du-dashboard
   Batch Size: 500

📥 Phase 1: EXTRACTION depuis Firestore
══════════════════════════════════════════════════
📊 3 collection(s) trouvée(s): users, orders, products
📥 Extraction de la collection: users
   ⏳ 500 documents extraits...
   ⏳ 1000 documents extraits...
   ✓ 1250 documents extraits de users
📥 Extraction de la collection: orders
   ✓ 340 documents extraits de orders
📥 E❌ Erreur : "MongoServerSelectionError: Server selection timed out"

**Cause** : Votre IP n'est pas autorisée sur MongoDB Atlas

**Solution** :
1. MongoDB Atlas → **Network Access**
2. **Add IP Address** → **Add Current IP Address**
3. Ou temporairement : **Allow Access from Anywhere** (`0.0.0.0/0`)

### ❌ Erreur : "ENOENT: no such file or directory 'config/firebase-key.json'"

**Cause** : Clé Firebase manquante

**Solution** :
1. Téléchargez votre clé de service depuis Firebase Console
2. Placez-la dans `config/firebase-key.json`
3. Vérifiez le chemin dans `.env`

### ❌ Erreur : "Unauthorized" ou "Authentication failed"

**Cause** : Credentials MongoDB incorrects

**Solution** :
1. Vérifiez votre `MONGODB_URI` dans `.env`
2. MongoDB Atlas → **Database Access** → Vérifiez l'utilisateur
3. Réinitialisez le mot de passe si nécessaire
4. Encodez les caractères spéciaux dans l'URL (ex: `@` → `%40`)

### 🐢 Migration très lente

**Solutions** :
- Augmentez `BATCH_SIZE` dans `.env` (ex: 1000)
- Vérifiez votre connexion internet
- Utilisez une instance MongoDB dans la même région

### 💾 Erreur de mémoire (heap out of memory)

**Solutions** :
- Réduisez `BATCH_SIZE` (ex: 250)
- Augmentez la mémoire Node.js : `node --max-old-space-size=4096 src/index.js`

---

## 🏗️ Architecture

Le projet suit l'architecture ETL modulaire :

```
┌─────────────────┐
│   index.js      │  ← Orchestrateur
│  (Coordinator)  │
└────────┬────────┘
         │
    ┌────┴─────────────────────┐
    │                          │
┌───▼────────┐  ┌──────▼──────┐  ┌──────▼──────┐
│ Extractor  │→ │ Transformer │→ │   Loader    │
│ (Firestore)│  │  (Convert)  │  │  (MongoDB)  │
└────────────┘  └─────────────┘  └─────────────┘
```

Voir [DOCUMENTATION.md](./DOCUMENTATION.md) pour les détails techniques.

---

## 🤝 Contribution

Les contributions sont les bienvenues ! 

1. Fork le projet
2. Créez une branche (`git checkout -b feature/amazing-feature`)
3. Committez vos changements (`git commit -m 'Add amazing feature'`)
4. Pushez la branche (`git push origin feature/amazing-feature`)
5. Ouvrez une Pull Request

---

## 📄 Licence

Ce projet est sous licence **ISC**.

---

## 📧 Support

Pour toute question ou problème :
- Ouvrez une [issue](../../issues)
- Consultez la [documentation technique](./DOCUMENTATION.md)

---

**Développé avec ❤️ pour faciliter les migrations Firestore → MongoDB**Transformation de products...
   ✓ 89 document(s) transformé(s)

✓ Transformation terminée

📤 Phase 3: CHARGEMENT dans MongoDB
══════════════════════════════════════════════════
🔌 Connexion à MongoDB...
✓ Connecté à MongoDB: du-dashboard
📤 Chargement dans users: 1250 document(s)
   ⏳ 500/1250 document(s) chargé(s)...
   ⏳ 1000/1250 document(s) chargé(s)...
   ✓ 1250 document(s) chargé(s) dans users
📤 Chargement dans orders: 340 document(s)
   ✓ 340 document(s) chargé(s) dans orders
📤 Chargement dans products: 89 document(s)
   ✓ 89 document(s) chargé(s) dans products

══════════════════════════════════════════════════
✅ MIGRATION TERMINÉE AVEC SUCCÈS!
══════════════════════════════════════════════════

📈 Statistiques de migration:
   Durée totale: 42.35s
   Documents total: 1679
   Documents insérés: 1679
   Erreurs: 0

📊 Par collection:
   ✓ users: 1250/1250 documents
   ✓ orders: 340/340 documents
   ✓ products: 89/89 documents

🔍 Vérification finale dans MongoDB:
   users: 1250 document(s)
   orders: 340 document(s)
   products: 89 document(s)

✨ Migration complétée!
```

---

## ⚠️ Notes importantes

### Avant la migration

- ✅ **Créez une sauvegarde** de vos données Firestore et MongoDB
- ✅ **Testez sur un environnement de dev** avant la production
- ✅ **Vérifiez vos quotas** MongoDB Atlas (stockage, connexions)
- ✅ **Autorisez votre IP** dans MongoDB Network Access

### Pendant la migration

- 🔄 Le script est **idempotent** : relançable sans doublons
- 📊 Les logs détaillés affichent la progression en temps réel
- ⚡ Ajustez `BATCH_SIZE` selon vos besoins (mémoire/performance)
- 🛡️ Les erreurs isolées ne stoppent pas le processus complet

### Après la migration

- ✔️ Comparez les statistiques finales (nombre de documents)
- ✔️ Vérifiez quelques documents dans MongoDB
- ✔️ Créez des index MongoDB si nécessaire
- ✔️ Testez vos requêtes sur la nouvelle base Logging détaillé du processus
- ✅ Gestion des erreurs robuste
- ✅ Rapport de migration avec statistiques

## 🔄 Transformation des données

Le script transforme automatiquement :

- **IDs Firestore** → `_id` MongoDB
- **Timestamp Firestore** → Date MongoDB
- **GeoPoint** → Format GeoJSON
- **References** → Chemins string

## ⚠️ Notes importantes

- Assurez-vous d'avoir une sauvegarde de vos données avant la migration
- Le script est idempotent : vous pouvez le relancer sans créer de doublons
- Les logs détaillés sont affichés dans la console
- Vérifiez les statistiques finales après la migration

## 📝 Exemple de sortie

```
🚀 Démarrage de la migration Firestore → MongoDB
📊 Collections trouvées: users, products, orders
✓ users: 1500 documents migrés
✓ products: 250 documents migrés
✓ orders: 3200 documents migrés
✅ Migration terminée avec succès!
📈 Total: 4950 documents en 45s
```

## 🛠️ Dépannage

### Erreur de connexion Firebase
Vérifiez que le chemin vers `firebase-key.json` est correct dans `.env`

### Erreur de connexion MongoDB
Vérifiez votre URI MongoDB et que votre IP est autorisée dans MongoDB Atlas

### Limite de mémoire
Si vous avez des collections très volumineuses, ajustez `BATCH_SIZE` dans `.env`

## 📄 Licence

ISC
