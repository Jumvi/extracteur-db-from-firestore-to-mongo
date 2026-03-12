Exemples d'utilisation rapide

1) Audit complet puis réparation ciblée

  # génération fichier manquant (dry-run)
  rm -f tmp/audit_flag1_missing.ndjson tmp/audit_flag1_full.json
  node tmp/geosuivi_spaces_copy_media.js --dry-run --overwrite --missing-out tmp/audit_flag1_missing.ndjson > tmp/audit_flag1_full.json

  # lire résumé
  wc -l tmp/audit_flag1_missing.ndjson && node tmp/read_missing_summary.js

  # réparer les UUIDs totalement absents (extraction + réparations par-UUID)
  node tmp/generate_geosuivi_ndjson.js --uuids-file tmp/missing_uuids.txt
  S3_PUT_TIMEOUT_MS=900000 REPAIR_MEDIA_RETRIES=5 TARGET_BYTES=1048576 node tmp/geosuivi_spaces_repair_missing_media.js --input-ndjson tmp/geosuivi_filenames_<uuid>.ndjson --uuid <uuid> --concurrency 2 --overwrite

2) Vérifier les counts par UUID

  node tmp/compare_counts_geosuivi_s3.js

3) Backfill d'instances listées

  node tmp/backfill_media_for_instances.js --instances-file tmp/rapport_media_repair_instances_all10.txt --doc-concurrency 1 --media-concurrency 2

Notes:
- Les fichiers sous `tmp/` servent d'artefacts et ne sont pas suivis par git ; ce dossier `scripts/command_guide` permet de documenter quelles commandes lancer et dans quel contexte.
