#!/bin/bash

## https://stackoverflow.com/questions/59895/how-do-i-get-the-directory-where-a-bash-script-is-located-from-within-the-script
SOURCE=${BASH_SOURCE[0]}
while [ -L "$SOURCE" ]; do # resolve $SOURCE until the file is no longer a symlink
  DIR=$( cd -P "$( dirname "$SOURCE" )" >/dev/null 2>&1 && pwd )
  SOURCE=$(readlink "$SOURCE")
  [[ $SOURCE != /* ]] && SOURCE=$DIR/$SOURCE # if $SOURCE was a relative symlink, we need to resolve it relative to the path where the symlink file was located
done
OUTDIR=$( cd -P "$( dirname "$SOURCE" )/../src/openapi" >/dev/null 2>&1 && pwd )

curl -o "$OUTDIR/schemas.yaml" https://raw.githubusercontent.com/interledger/open-payments/b363d33038fe789e5388f04f80ddd06a4fa97093/openapi/schemas.yaml
curl -o "$OUTDIR/auth-server.yaml" https://raw.githubusercontent.com/interledger/open-payments/b363d33038fe789e5388f04f80ddd06a4fa97093/openapi/auth-server.yaml
