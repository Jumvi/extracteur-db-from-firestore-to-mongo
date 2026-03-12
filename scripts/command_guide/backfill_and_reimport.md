But: commandes pour backfill de médias à partir d'instances et réimport de files.

Commandes courantes:

- Backfill médias pour une liste d'instances (ex: `tmp/rapport_media_repair_instances_all10.txt`):

  MIN_BYTES=1048576 ODK_MEDIA_COMPRESS_IMAGES=true ODK_MEDIA_MAX_WIDTH=1600 ODK_MEDIA_JPEG_QUALITY=75 S3_PUT_TIMEOUT_MS=900000 ODK_MEDIA_RETRIES=5 node tmp/backfill_media_for_instances.js --instances-file <file> --doc-concurrency 1 --media-concurrency 2

- Backfill segments + médias pour instances non-synchronisées:

  S3_KEY_PREFIX=rapports S3_PUT_TIMEOUT_MS=900000 ODK_MEDIA_RETRIES=5 node tmp/backfill_segments_then_media_for_instances.js --instances-file <file> --doc-concurrency 1 --media-concurrency 2

- Réimport en file d'attente (worker queue):

  node tmp/reimport_queue_remaining5.js

- Import direct de rapports/images vers S3 (usage ponctuel):

  MIN_BYTES=1048576 ODK_MEDIA_COMPRESS_IMAGES=true ODK_MEDIA_MAX_WIDTH=1600 ODK_MEDIA_JPEG_QUALITY=75 S3_PUT_TIMEOUT_MS=300000 S3_PUT_RETRIES=5 RAPPORT_DOWNLOAD_RETRIES=5 node tmp/import_rapport_images_to_s3.js --concurrency 1

Conseils:
- Vérifier les fichiers `tmp/*.log` et `tmp/*.done` pour l'état des runs.
- Ajuster `--doc-concurrency` / `--media-concurrency` pour éviter timeouts sur réseau.
