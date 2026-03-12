#!/usr/bin/env bash
set -euo pipefail

# Liste les clés S3 pour les UUIDs fournis
node tmp/list_s3_keys_for_uuids.js "$@"
