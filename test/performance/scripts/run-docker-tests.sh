#!/bin/bash

c9_gql_url="http://localhost:3001/graphql"
c9_wallet_address="http://localhost:3000/accounts/gfranklin"
hlb_wallet_address="http://localhost:4000/accounts/pfry"

# Verify that the localenv backend is live
if curl -s --head --request GET "$c9_gql_url" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Localenv is up: $c9_gql_url"
else
  echo "Localenv is down: $c9_gql_url"
  exit 1
fi

# Verify that cloud nine wallet address is live
if curl -s --head --request GET "$c9_wallet_address" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Cloud Nine Wallet Address is up: $c9_wallet_address"
else
  echo "Cloud Nine Wallet Address is down: $c9_wallet_address"
  exit 1
fi

# Verify that happy life bank wallet address is live
if curl -s --head --request GET "$hlb_wallet_address" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Happy Life Bank Address is up: $hlb_wallet_address"
else
  echo "Happy Life Bank Address is down: $hlb_wallet_address"
  exit 1
fi

# run tests
docker run --rm --network=rafiki_rafiki -v ./scripts:/scripts -i grafana/k6 run /scripts/create-outgoing-payments.js
exit $?
