#!/bin/bash

# This script runs the integration tests. It starts the test environment, runs the tests,
# saves the container logs to a file, and stops the containers.
# Usage:
#   ./script.sh            # Run the script with default options
#   ./script.sh --build    # Re-build the docker images (-b or --build)

timeout=30
log_file="/tmp/rafiki_integration_logs.txt"
build_flag=""

# Parse cli args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -b|--build)
      build_flag="--build"
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

pnpm --filter integration testenv:compose down --volumes
pnpm --filter integration testenv:compose up -d $build_flag
pnpm --filter integration testenv:compose logs -f --tail=0 > "$log_file" 2>&1 &

# perform health check until OK, or errors if timeout.
function pollUrl() {
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

pollUrl "http://localhost:4000/healthz"
pnpm --filter integration test
pnpm --filter integration testenv:compose down --volumes
