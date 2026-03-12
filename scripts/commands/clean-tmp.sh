#!/usr/bin/env bash
# Remove ephemeral tmp logs and generated ndjson while keeping scripts
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_DIR="$ROOT_DIR/../tmp"
if [ ! -d "$TMP_DIR" ]; then
  echo "tmp directory not found: $TMP_DIR"
  exit 0
fi
# keep js scripts in tmp, remove common artifacts
rm -f "$TMP_DIR"/*.log
rm -f "$TMP_DIR"/*_missing.ndjson
rm -f "$TMP_DIR"/*.ndjson
rm -f "$TMP_DIR"/*.txt
rm -f "$TMP_DIR"/*.done
rm -f "$TMP_DIR"/*.zip
echo "cleaned $TMP_DIR artifacts"
