#!/bin/bash

# Defaults to local environment, not running k6 in docker
ENV_NAME="local"
DOCKER_MODE=false

# Parse cli args
while [[ $# -gt 0 ]]; do
  case "$1" in
  --docker)
    DOCKER_MODE=true
    shift
    ;;
  *)
    ENV_NAME="$1"
    shift
    ;;
  esac
done

ENV_FILE="config/$ENV_NAME.env"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: Config file '$ENV_FILE' not found."
  exit 1
fi

# Load env vars
set -o allexport
source "$ENV_FILE"
set +o allexport

check_service() {
  local url=$1
  local name=$2

  if curl -s --head --request GET "$url" | grep "HTTP/1.[01]" >/dev/null; then
    echo "$name is up: $url"
  else
    echo "$name is down: $url"
    exit 1
  fi
}

check_service "$C9_GQL_URL" "$ENV_NAME environment"
check_service "$C9_WALLET_ADDRESS" "Cloud Nine Wallet Address"
check_service "$HLB_WALLET_ADDRESS" "Happy Life Bank Address"

add_host() {
  local hostname="$1"

  # Check first to avoid unnecessary sudo prompts
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

# Add hosts from env var. Expects comma seperated values.
IFS=',' read -ra HOST_ARRAY <<<"$HOSTS"
for host in "${HOST_ARRAY[@]}"; do
  add_host "$host"
done

# run tests
if $DOCKER_MODE; then
  pnpm --filter performance test-docker
else
  pnpm --filter performance test
fi
exit $?
