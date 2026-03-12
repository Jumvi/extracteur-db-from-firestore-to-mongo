# API NestJS (isolé)

Ce dossier contient un scaffold minimal NestJS pour exposer des endpoints d'audit/repair.

Installation et démarrage (depuis la racine du projet) :

```bash
cd scripts/api-nest
npm install
npm run start:dev
```

Endpoints exposés (exemples) :
- POST /audit/strict      -> body optionnel, déclenche `scripts/commands/strict-audit.sh`
- POST /audit/repair      -> { input: 'tmp/geosuivi_filenames_<uuid>.ndjson' } déclenche `repair-from-ndjson.sh`
- GET  /audit/status/:id  -> récupère le log `tmp/job_<id>.log` si présent

Remarque:
- Ce mini-projet est isolé pour éviter d'ajouter des dépendances globales au repo principal.
- Après `npm install`, le serveur écoute par défaut sur le port `3001`.
