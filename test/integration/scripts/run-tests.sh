#!/bin/bash

# This script runs the integration tests. It starts the test environment, runs the tests,
# saves the container logs to a file, and stops the containers.
# Usage:
#   ./script.sh            # Run the script with default options
#   ./script.sh --build    # Skip building the docker images and internal test dependencies (-nb or --no-build)

log_file="./tmp/rafiki_integration_logs.txt"
build_flag="--build"

# Parse cli args
while [[ $# -gt 0 ]]; do
  case "$1" in
    -nb|--no-build)
      build_flag=""
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

if [ "$build_flag" == "--build" ]; then
  pnpm --filter integration build:deps
fi

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
