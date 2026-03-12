But: identifier les rapports `flag_rapport=1`, lister leurs filenames, et réparer les fichiers manquants dans Spaces.

Principales commandes:

- Audit strict (liste rapports flag=1 puis vérifie présence S3 par UUID):

  node tmp/strict_audit.js

  Sorties: `tmp/strict_audit_*.json` (logs), liste d'UUIDs manquants.

- Générer NDJSON filenames par UUID (autoritatif):

  node tmp/generate_geosuivi_ndjson.js --uuids-file <file.txt>

  Sorties: `tmp/geosuivi_filenames_<uuid>.ndjson` (une ligne par fichier).

- Réparateur per-UUID (download → compress → upload old+new):

  S3_PUT_TIMEOUT_MS=900000 REPAIR_MEDIA_RETRIES=5 TARGET_BYTES=1048576 node tmp/geosuivi_spaces_repair_missing_media.js --input-ndjson tmp/geosuivi_filenames_<uuid>.ndjson --uuid <uuid> --concurrency 2 --overwrite

  Sorties: logs `tmp/geosuivi_spaces_repair_<uuid>.log` et progress.

- Audit filenames GeoSuivi→Spaces (dry-run) — liste paires manquantes:

  node tmp/geosuivi_spaces_copy_media.js --dry-run --overwrite --missing-out tmp/audit_flag1_missing_after_repair.ndjson

Conseils:
- Toujours travailler à partir de `getdetailsrapportbyuuid/<uuid>` (liste complète des filenames).
- Utiliser `--dry-run` pour collecter paires manquantes avant réparation.
