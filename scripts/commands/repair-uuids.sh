#!/usr/bin/env bash
set -euo pipefail

# Wrapper: produce missing NDJSON for provided UUIDs then run repair
# Expects --missing-out <path> among args

MISSING_OUT=""
ARGS=("$@")
for ((i=0;i<${#ARGS[@]};i++)); do
  if [ "${ARGS[$i]}" = "--missing-out" ]; then
    MISSING_OUT="${ARGS[$((i+1))]:-}"
    break
  fi
done

if [ -z "$MISSING_OUT" ]; then
  echo "Missing required --missing-out <path>" >&2
  exit 2
fi

echo "[repair-uuids] generating missing NDJSON -> $MISSING_OUT"
node tmp/geosuivi_spaces_copy_media.js --dry-run "${ARGS[@]}"

echo "[repair-uuids] running repair on $MISSING_OUT"
node tmp/geosuivi_spaces_repair_missing_media.js --input-ndjson "$MISSING_OUT" "${ARGS[@]}"
