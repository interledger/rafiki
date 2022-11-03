#!/bin/bash

## https://stackoverflow.com/questions/59895/how-do-i-get-the-directory-where-a-bash-script-is-located-from-within-the-script
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
OUTDIR=$( cd -P "$( dirname "$SOURCE" )/../openapi" >/dev/null 2>&1 && pwd )

#curl -o "$OUTDIR/schemas.yaml" https://raw.githubusercontent.com/interledger/open-payments/main/openapi/schemas.yaml
curl -o "$OUTDIR/schemas.yaml" https://raw.githubusercontent.com/interledger/open-payments/67429f0c7d658c2aaeb59a330be3ec305413f827/openapi/schemas.yaml

