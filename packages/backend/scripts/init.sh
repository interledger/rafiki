#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DROP DATABASE IF EXISTS TESTING;
    CREATE DATABASE testing;
    CREATE DATABASE development;
EOSQL

# node -r ./.pnp.cjs ./dist/index.js

# yarn install --immutable --immutable-cache
# yarn workspace $INIT_CWD add backend
echo "abcd"