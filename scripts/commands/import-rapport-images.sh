#!/usr/bin/env bash
set -euo pipefail

# Import rapport images to S3
node tmp/import_rapport_images_to_s3.js "$@"
