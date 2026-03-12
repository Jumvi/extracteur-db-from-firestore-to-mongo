#!/usr/bin/env bash
set -euo pipefail

# Backfill médias pour une liste d'instances
node tmp/backfill_media_for_instances.js "$@"
