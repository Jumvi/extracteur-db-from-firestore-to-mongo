#!/usr/bin/env bash
set -euo pipefail

# Lance la file de réimport restante
node tmp/reimport_queue_remaining5.js "$@"
