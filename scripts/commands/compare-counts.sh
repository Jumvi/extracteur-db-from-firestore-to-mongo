#!/usr/bin/env bash
set -euo pipefail

# Compare GeoSuivi filename counts vs S3 counts
node tmp/compare_counts_geosuivi_s3.js "$@"
