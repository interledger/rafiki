#!/bin/bash

## https://stackoverflow.com/questions/59895/how-do-i-get-the-directory-where-a-bash-script-is-located-from-within-the-script
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
OUTDIR=$( cd -P "$( dirname "$SOURCE" )/../src/openapi" >/dev/null 2>&1 && pwd )

curl -o "$OUTDIR/schemas.yaml" https://raw.githubusercontent.com/interledger/open-payments/56d441fe7f1d44f9111ae1a37de536e72407038d/openapi/schemas.yaml
curl -o "$OUTDIR/auth-server.yaml" https://raw.githubusercontent.com/interledger/open-payments/56d441fe7f1d44f9111ae1a37de536e72407038d/openapi/auth-server.yaml
