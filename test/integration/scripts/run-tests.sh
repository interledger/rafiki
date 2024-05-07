#!/bin/bash

# This script runs the integration tests. It starts the test environment, runs the tests,
# and stops the containers. It saves the container logs to a file and edits /etc/hosts.
# Usage:
#   ./script.sh            # Run the script with default options
#   ./script.sh --no-build    # Skip building the docker images and internal test dependencies (-nb or --no-build)

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

# setup hosts
addHost() {
  local hostname="$1"
  
  # check first to avoid sudo prompt if host is already set
  if pnpm --filter integration hostile list | grep -q "127.0.0.1 $hostname"; then
    echo "$hostname already set"
  else
    sudo pnpm --filter integration hostile set 127.0.0.1 "$hostname"
    if [ $? -ne 0 ]; then
      echo "Error: Failed to write hosts to hostfile."
      exit 1
    fi
  fi
}
addHost "cloud-nine-wallet-test-backend"
addHost "cloud-nine-wallet-test-auth"
addHost "happy-life-bank-test-backend"
addHost "happy-life-bank-test-auth"

# idempotent start
pnpm --filter integration testenv:compose down --volumes
pnpm --filter integration testenv:compose up -d --wait $build_flag
if [ $? -ne 0 ]; then
  echo "Error: Failed to start containers."
  exit 1
fi

# run tests
mkdir -p ./tmp
pnpm --filter integration testenv:compose logs -f > "$log_file" 2>&1 &
pnpm --filter integration test
exit_code=$?
pnpm --filter integration testenv:compose down --volumes

exit $exit_code