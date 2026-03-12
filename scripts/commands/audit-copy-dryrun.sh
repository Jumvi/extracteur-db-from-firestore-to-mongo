#!/usr/bin/env bash
set -euo pipefail

# Audit GeoSuivi→Spaces en dry-run et écrit les paires manquantes
node tmp/geosuivi_spaces_copy_media.js --dry-run "$@"
