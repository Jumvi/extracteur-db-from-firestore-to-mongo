# 🚀 Guide de déploiement GitHub

## Étapes pour pusher votre projet

### 1. Vérifier que les secrets sont exclus

```bash
# Vérifier le .gitignore
cat .gitignore

# S'assurer que ces fichiers ne seront PAS poussés:
# - .env
# - config/firebase-key.json
```

### 2. Initialiser Git (si pas déjà fait)

```bash
cd /Users/kadea/Juproject/du-project-all/export-firestore-mongo

# Initialiser le repository
git init

# Configurer votre identité (si nécessaire)
git config user.name "Votre Nom"
git config user.email "votre.email@example.com"
```

### 3. Ajouter tous les fichiers

```bash
# Ajouter tous les fichiers (sauf ceux dans .gitignore)
git add .

# Vérifier ce qui sera commité
git status

# ⚠️ Vérifiez que .env et firebase-key.json ne sont PAS listés
```

### 4. Créer le premier commit

```bash
git commit -m "Initial commit: Firestore to MongoDB ETL

- Implémentation complète de l'ETL
- Extraction de Firestore avec pagination
- Transformation automatique des types
- Chargement par batch dans MongoDB
- Documentation complète
"
```

### 5. Créer un repository sur GitHub

1. Allez sur [github.com](https://github.com) et connectez-vous
2. Cliquez sur le **+** en haut à droite → **New repository**
3. Nommez votre repo : `firestore-mongodb-etl`
4. **Ne pas** initialiser avec README, .gitignore ou license (déjà présents)
5. Cliquez sur **Create repository**

### 6. Lier et pousser vers GitHub

```bash
# Remplacez VOTRE_USERNAME par votre username GitHub
git remote add origin https://github.com/VOTRE_USERNAME/firestore-mongodb-etl.git

# Renommer la branche en main (si nécessaire)
git branch -M main

# Pousser vers GitHub
git push -u origin main
```

### 7. Vérification de sécurité

Après le push, vérifiez sur GitHub que ces fichiers **n'apparaissent PAS** :
- ❌ `.env`
- ❌ `config/firebase-key.json`
- ❌ `node_modules/`

Si vous les voyez, **SUPPRIMEZ-LES IMMÉDIATEMENT** :

```bash
# Supprimer un fichier du repo GitHub
git rm --cached .env
git rm --cached config/firebase-key.json
git commit -m "Remove sensitive files"
git push origin main

# Ensuite, changez vos credentials Firebase et MongoDB!
```

---

## 🔒 Sécurité - IMPORTANT

### ⚠️ Si vous avez poussé des secrets par erreur

1. **Supprimez-les immédiatement** du repo
2. **Révoquez les credentials** :
   - Firebase : Générez une nouvelle clé de service
   - MongoDB : Changez le mot de passe de l'utilisateur
3. **Ne jamais** utiliser `git revert` - les secrets restent dans l'historique
4. Utilisez [BFG Repo-Cleaner](https://rtyley.github.io/bfg-repo-cleaner/) pour nettoyer l'historique

### ✅ Bonnes pratiques

- Toujours vérifier `git status` avant `git add`
- Utiliser `.gitignore` dès le début
- Pour les projets d'équipe : utiliser GitHub Secrets ou un gestionnaire de secrets

---

## 📝 Mettre à jour le README avec l'URL du repo

Une fois le repo créé, mettez à jour le README :

```bash
# Éditez README.md et remplacez <your-repo-url> par l'URL réelle
# Par exemple: https://github.com/VOTRE_USERNAME/firestore-mongodb-etl.git
```

---

## 🎯 Prochaines étapes

### Ajouter un badge de build (optionnel)

Si vous ajoutez des tests :
```markdown
[![Tests](https://github.com/VOTRE_USERNAME/firestore-mongodb-etl/actions/workflows/test.yml/badge.svg)](https://github.com/VOTRE_USERNAME/firestore-mongodb-etl/actions)
```

### Créer des releases

```bash
# Créer un tag de version
git tag -a v1.0.0 -m "Release v1.0.0 - Initial ETL implementation"
git push origin v1.0.0
```

### Ajouter des GitHub Actions (CI/CD)

Créez `.github/workflows/test.yml` pour automatiser les tests.

---

## 🆘 Aide

Si vous rencontrez des problèmes :

```bash
# Vérifier les remotes
git remote -v

# Voir l'historique
git log --oneline

# Annuler le dernier commit (local uniquement)
git reset --soft HEAD~1
```

---

**Bonne chance avec votre projet ! 🚀**
