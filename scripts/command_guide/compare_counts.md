But: comparer le nombre de filenames listés par GeoSuivi vs nombre d'objets S3 (old+new) par `uuid`.

Commande:

  node tmp/compare_counts_geosuivi_s3.js

Variables d'environnement utiles:
- `RAPPORT_LIST_URL` et `RAPPORT_DETAILS_BASE` pour pointer vers l'API GeoSuivi
- `S3_BUCKET`, `S3_ENDPOINT`, `AWS_REGION`, `S3_FORCE_PATH_STYLE`

Sorties:
- `tmp/count_diffs.ndjson` : une ligne JSON par `uuid` avec `geosuivi_count`, `s3_count`, `sample_s3`.
- `tmp/count_diffs_summary.json` : résumé {checked, mismatches}.

Interprétation:
- `mismatch: true` signifie que le nombre de fichiers listés dans GeoSuivi diffère du nombre d'objets S3 (basename unique) — nécessite analyse filename-level.
