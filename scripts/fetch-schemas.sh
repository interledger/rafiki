#!/bin/bash

REPO_ROOT=$(git rev-parse --show-toplevel)
BRANCH_OR_TAG="${1:-%40interledger/open-payments%406.7.0}"
BASE_URL="https://raw.githubusercontent.com/interledger/open-payments/$BRANCH_OR_TAG"

OUT_DIR="$REPO_ROOT/openapi"
FILES=("schemas.yaml" "auth-server.yaml" "resource-server.yaml" "wallet-address-server.yaml")

mkdir -p "$OUT_DIR"

for fn in "${FILES[@]}"; do
  echo "Fetching $fn@$BRANCH_OR_TAG"
  curl --fail -o "$OUT_DIR/$fn" "$BASE_URL/openapi/$fn" || {
    echo "Failed to fetch $fn"
    exit 1
  }
done
