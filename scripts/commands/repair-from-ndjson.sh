#!/usr/bin/env bash
set -euo pipefail

# Répare en lisant un NDJSON (download, compress, upload)
node tmp/geosuivi_spaces_repair_missing_media.js "$@"
