But de ce dossier

Ce dossier regroupe des fiches courtes (commandes, variables d'environnement, fichiers de sortie) expliquant quel script utiliser selon le cas d'usage rencontré lors de la synchronisation GeoSuivi ↔ Spaces.

Fichiers inclus:
- `audit_and_repair.md` : audit strict, extraction par UUID, réparation par-UUID
- `compare_counts.md` : comparaison comptage GeoSuivi vs S3
- `backfill_and_reimport.md` : commandes de backfill / réimport
- `usage_examples.md` : scénarios pas-à-pas (exemples)

Ajoutez ici d'autres fiches si vous créez de nouveaux scripts.

Wrappers exécutables:

Les wrappers shell qui exécutent les scripts présents dans `tmp/` ont été ajoutés sous `scripts/commands/`.
Exemples:
- `scripts/commands/strict-audit.sh`
- `scripts/commands/compare-counts.sh`
- `scripts/commands/generate-ndjson.sh`

Ces wrappers facilitent l'exécution et peuvent être commités (contrairement aux fichiers `tmp/`).
