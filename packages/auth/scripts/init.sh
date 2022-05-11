#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DROP DATABASE IF EXISTS AUTH_TESTING;
    CREATE DATABASE auth_testing;
    CREATE DATABASE auth_development;
EOSQL
