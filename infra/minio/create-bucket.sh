#!/usr/bin/env sh
set -eu

MC_HOST="${MC_HOST:-http://minioadmin:minioadmin@localhost:9000}"
BUCKET="${PLATFORM_S3_BUCKET:-research-assets}"

mc alias set local "$MC_HOST"
mc mb --ignore-existing "local/$BUCKET"
mc anonymous set none "local/$BUCKET"
