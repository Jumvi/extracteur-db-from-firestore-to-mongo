#!/usr/bin/env bash
set -euo pipefail

# Lance l'audit strict (filtre flag_rapport=1)
node tmp/strict_audit.js "$@"
