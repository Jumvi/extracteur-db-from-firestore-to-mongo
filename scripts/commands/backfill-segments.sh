#!/usr/bin/env bash
set -euo pipefail

# Backfill segments then media for instances
node tmp/backfill_segments_then_media_for_instances.js "$@"
