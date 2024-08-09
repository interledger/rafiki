#!/bin/bash

c9_gql_url="http://localhost:3001/graphql"
c9_wallet_address="http://localhost:3000/"
hlb_wallet_address="http://localhost:4000/"

# Verify that the localenv backend is live
if curl -s --head --request GET "$c9_gql_url" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Localenv is up: $c9_gql_url"
else
  echo "Localenv is down: $c9_gql_url"
  exit 1
fi

# Verify that cloud nine mock ase is live
if curl -s --head --request GET "$c9_wallet_address" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Cloud Nine Wallet Address is up: $c9_wallet_address"
else
  echo "Cloud Nine Wallet Address is down: $c9_wallet_address"
  exit 1
fi

# Verify that happy life bank mock ase is live
if curl -s --head --request GET "$hlb_wallet_address" | grep "HTTP/1.[01]" > /dev/null; then
  echo "Happy Life Bank Address is up: $hlb_wallet_address"
else
  echo "Happy Life Bank Address is down: $hlb_wallet_address"
  exit 1
fi

# setup hosts
addHost() {
  local hostname="$1"
  
  # check first to avoid sudo prompt if host is already set
  if pnpm --filter performance hostile list | grep -q "127.0.0.1 $hostname"; then
    echo "$hostname already set"
  else
    sudo pnpm --filter performance hostile set 127.0.0.1 "$hostname"
    if [ $? -ne 0 ]; then
      echo "Error: Failed to write hosts to hostfile."
      exit 1
    fi
  fi
}
addHost "cloud-nine-wallet-backend"
addHost "cloud-nine-wallet-auth"
addHost "happy-life-bank-backend"
addHost "happy-life-bank-auth"

# run tests
if [[ $* == *--docker* ]]; then
  pnpm --filter performance test-docker
else 
  pnpm --filter performance test
fi
exit $?
