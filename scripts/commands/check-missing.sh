#!/usr/bin/env bash
set -euo pipefail

# Vérifie si les fichiers listés dans un NDJSON d'audit existent dans le new prefix
node tmp/check_missing_exists_in_new_prefix.js "$@"
