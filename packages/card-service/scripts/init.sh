#!/bin/bash
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    DROP DATABASE IF EXISTS CARD_SERVICE_TESTING;
    CREATE DATABASE card_service_testing;
    CREATE DATABASE card_service_development;
EOSQL 
