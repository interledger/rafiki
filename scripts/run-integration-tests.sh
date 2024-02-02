#!/bin/bash

timeout=30

pnpm --filter integration testenv:compose down
pnpm --filter integration testenv:compose up -d

# perform healthcheck until OK, or errors if timeout.
function makeRequest() {
  local url="$1"
  local start_time=$(date +%s)

  while true; do
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url")

    if [ "$response" == "200" ]; then
      echo "Health check successful! Response: OK"
      break
    fi

    current_time=$(date +%s)
    elapsed_time=$((current_time - start_time))

    if [ "$elapsed_time" -ge "$timeout" ]; then
      echo "Timeout reached. Health check failed."
      exit 1
    fi

    sleep 1
  done
}

makeRequest "http://localhost:4000/healthz"

pnpm --filter integration test
