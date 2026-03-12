#!/usr/bin/env bash
set -euo pipefail

# Génère les fichiers NDJSON avec filenames pour chaque UUID
node tmp/generate_geosuivi_ndjson.js "$@"
