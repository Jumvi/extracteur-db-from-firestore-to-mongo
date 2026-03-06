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

---

## 🧭 Export ODK Central → MongoDB (submissions + médias)

Ce repo contient aussi un script de sync **ODK Central (OData)** vers **MongoDB**.

### 1) Variables d'environnement

Dans `.env`, renseignez au minimum :

```env
MONGODB_URI=...
MONGODB_DATABASE=...

ODK_BASE_URL=https://your-odk-central.example.com/v1
ODK_LOGIN_URL=https://your-odk-central.example.com/v1/sessions
ODK_EMAIL=...
ODK_PASS=...
ODK_PROJECT=1

ODK_SUBMISSIONS_URL_TEMPLATE=https://your-odk-central.example.com/v1/projects/{projectId}/forms/{formId}.svc/Submissions?{query}
```

Options utiles (voir `.env.example`) :
- `ODK_EXCLUDE_TESTS=true` pour ignorer les submissions marquées *test/tests*
- `--expand` et/ou hydration `@odata.navigationLink` pour récupérer les repeats/segments
- Médias : S3/Spaces via `S3_BUCKET`+`AWS_ACCESS_KEY_ID`+`AWS_SECRET_ACCESS_KEY`, sinon stockage Mongo **GridFS** (`odk_media`)

### 2) Lancer une migration

Lister les formulaires d'un projet (pour récupérer le `xmlFormId` à passer à `--form`) :

```bash
npm run odk:listForms -- [projectId]
```

Sync une forme (une fois) :

```bash
npm run odk:migrate -- --form <xmlFormId> --once
```

### 2.b) Récupérer par date (fenêtre temporelle)

Le script supporte un **borne basse** via `--since` (ISO ou `YYYY-MM-DD`).

Exemple : importer toutes les submissions à partir du 1er février (en ignorant `sync_state`) :

```bash
node src/odk-migrate.js \
   --form <xmlFormId> \
   --project 1 \
   --since 2026-02-01T00:00:00.000Z \
   --ignore-state \
   --orderby "__system/submissionDate asc" \
   --once
```

Notes importantes :
- `--since` envoie (par défaut) un filtre OData côté serveur : `__system/submissionDate gt <since>`.
- Pour éviter de rater des soumissions proches de la borne, le script applique un **backwindow** (défaut `10s`).
   - Ajustable via `--backwindow <secs>`.
- Si votre serveur ODK rejette le filtre, utilisez `--no-server-filter-since` (filtrage côté client uniquement).

Pour une fenêtre exacte **[since, until)** lors d’un backfill Mongo (voir plus bas), utilisez `--until <iso>`.

### 2.c) Hydratation des repeats / segments

Deux approches complémentaires :

1) `$expand` (rapide, mais il faut connaître les groupes à expanser)

```bash
node src/odk-migrate.js \
   --form <xmlFormId> \
   --project 1 \
   --since 2026-02-01 \
   --ignore-state \
   --expand "etat_troncon,propretes_obs,point_vue_usagers" \
   --once
```

2) Hydratation des `@odata.navigationLink` (récursif)

Par défaut, le script peut suivre les `...@odata.navigationLink` et attacher les collections au document.

Options utiles :
- `--nav-depth <n>` : profondeur max (défaut `4`)
- `--nav-concurrency <n>` : requêtes parallèles (défaut `6`)
- `--nav-max-requests <n>` : garde-fou anti-boucle
- `--nav-timeout-ms <n>` / `--nav-budget-ms <n>` : timeouts
- `--strip-navlinks` : supprime les clés `@odata.navigationLink` après hydratation
- `--no-hydrate-nav` : désactive complètement

### 2.d) Backfill « segments seulement » (Mongo → ODK → Mongo)

Si les submissions sont déjà en Mongo mais que vous voulez hydrater **uniquement** `etat_troncon.segments` :

```bash
node src/odk-migrate.js \
   --form <xmlFormId> \
   --project 1 \
   --since 2026-02-01T00:00:00.000Z \
   --until 2026-03-01T00:00:00.000Z \
   --backfill-segments \
   --once
```

Par défaut, le backfill **skip** les docs où `etat_troncon.segments` est déjà présent.
Pour forcer un recalcul : `--segments-force`.

Mode démon (sync continue) :

```bash
npm run odk:migrate:daemon -- --form <xmlFormId>
```

Migrer toutes les formes du projet :

```bash
npm run odk:migrate:daemon:expand
```

### 3) Vérifier dans Mongo

Les submissions sont upsertées dans la collection :

```
odk_submissions_<formId>
```

Debug rapide :

```bash
node scripts/listSubmissions.js <formId>
```

---

## 🖼️ Médias ODK → DigitalOcean Spaces (S3) + CDN

Le script [src/odk-migrate.js](src/odk-migrate.js) peut :
- Télécharger les médias depuis ODK (attachments)
- Les stocker soit dans **DigitalOcean Spaces (S3 compatible)**, soit dans **Mongo GridFS** (fallback)
- Écrire dans Mongo un tableau `attachments[]` contenant les URLs/metadata

### Comportement

- Si `AWS_ACCESS_KEY_ID` + `AWS_SECRET_ACCESS_KEY` + `S3_BUCKET` sont définis : upload dans Spaces.
   - La clé objet utilisée est :
      - `"<formId>/<instanceId>/<filename>"`
   - Le script écrit l’URL publique dans `attachments[].s3`.
- Sinon : stockage dans GridFS (bucket `odk_media`) et `attachments[].gridFs`.

Pour désactiver le transfert binaire (ne garder que des liens proxy), utilisez `--skip-media`.

### Backfill médias (Mongo → ODK media → S3/GridFS → Mongo)

Si vos submissions sont déjà en Mongo et que vous avez ensuite hydraté des champs (ex: `etat_troncon.segments`) contenant **d’autres photos**, vous pouvez compléter `attachments[]` sans relancer une hydratation OData profonde :

```bash
node src/odk-migrate.js \
   --form <xmlFormId> \
   --project 1 \
   --since 2026-02-01T00:00:00.000Z \
   --until 2026-03-01T00:00:00.000Z \
   --backfill-media \
   --once
```

Mode ciblé (une submission) :

```bash
node src/odk-migrate.js \
   --form <xmlFormId> \
   --project 1 \
   --instance uuid:xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx \
   --backfill-media \
   --once
```

Par défaut, le backfill **skip** les fichiers déjà présents dans `attachments[]` (S3/GridFS). Pour forcer un re-upload : `--media-force`.

### Compression d'images (optionnel)

Pour faciliter l'usage dans le front (images plus légères), vous pouvez activer une compression avant upload S3.

```env
ODK_MEDIA_COMPRESS_IMAGES=true
ODK_MEDIA_MAX_WIDTH=1920
ODK_MEDIA_JPEG_QUALITY=80
ODK_MEDIA_PNG_COMPRESSION_LEVEL=9
```

Effets :
- Applique seulement aux fichiers `.jpg/.jpeg/.png`.
- Uploade l'image compressée à la **même clé S3** (`<formId>/<instanceId>/<filename>`).
- Enrichit `attachments[]` avec des champs utiles au front :
   - `s3Compressed=true`, `s3ContentType`, `s3Bytes`

### Variables Spaces / S3

```env
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=us-east-1

S3_BUCKET=du-medias
S3_ENDPOINT=https://sfo3.digitaloceanspaces.com
S3_FORCE_PATH_STYLE=false

# (optionnel) ACL appliquée à l’upload (défaut: public-read)
S3_PUBLIC_ACL=public-read
```

### CDN public (optionnel)

Ces variables contrôlent **comment l’URL publique** est construite après upload :

```env
S3_CDN=https://du-medias.sfo3.cdn.digitaloceanspaces.com
S3_USE_CDN=true
S3_PUBLIC_URL_TEMPLATE={cdn}/{key}
```

Interprétation :
- `S3_USE_CDN=true` : le code préfère construire l’URL via le CDN
- `S3_CDN` : base URL du CDN
- `S3_PUBLIC_URL_TEMPLATE` : modèle d’URL publique
   - Tokens : `{cdn}`, `{bucket}`, `{key}`
   - `{key}` correspond à la clé objet S3 (ex: `audit_form/uuid:.../photo.jpg`) et est **encodée** segment par segment

Exemple d’URL produite :

```text
https://du-medias.sfo3.cdn.digitaloceanspaces.com/<formId>/<instanceId>/<filename>
```

Si votre Space/CDN est privé, laissez `S3_PUBLIC_ACL` à une valeur restrictive et utilisez plutôt :
- un proxy backend (`ODK_ATTACHMENT_PROXY_TEMPLATE`) ou
- des URLs signées côté application.

---

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
