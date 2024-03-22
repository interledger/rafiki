#!/bin/bash

# This script runs the integration tests. It starts the test environment, runs the tests,
# saves the container logs to a file, and stops the containers.
# Usage:
#   ./script.sh            # Run the script with default options
#   ./script.sh --build    # Re-build the docker images (-b or --build)

log_file="./tmp/rafiki_integration_logs.txt"
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
pnpm --filter integration testenv:compose up -d --wait $build_flag

if [ $? -ne 0 ]; then
  echo "Error: Failed to start containers."
  exit 1
fi

mkdir -p ./tmp
pnpm --filter integration testenv:compose logs -f > "$log_file" 2>&1 &

pnpm --filter integration test
pnpm --filter integration testenv:compose down --volumes
