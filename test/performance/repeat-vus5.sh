#!/usr/bin/env bash
# Repeatability check at the peak-throughput concurrency (5 VUs).
# A single 45s run cannot distinguish a real +15% from run-to-run noise, so this
# resets, warms up, then takes N measurements of the same build.
#
# Usage: repeat-vus5.sh LABEL [N]
set -uo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
LABEL="${1:?usage: repeat-vus5.sh LABEL [N]}"
N="${2:-3}"

COMPOSE=(docker compose
  -f ./localenv/cloud-nine-wallet/docker-compose.yml
  -f ./localenv/happy-life-bank/docker-compose.yml
  -f ./localenv/merged/docker-compose.yml
  -f ./localenv/tigerbeetle/docker-compose.yml
  --env-file ./localenv/tigerbeetle/.env.tigerbeetle)

run_k6() {
  docker run --rm --network=rafiki_rafiki \
    -v "$REPO_ROOT/test/performance/scripts:/scripts" \
    -v "$REPO_ROOT/test/performance/dist:/dist" \
    -e SCENARIO=vus -e VUS=5 -e DURATION=45s -e LABEL="$LABEL" \
    -e CLOUD_NINE_GQL_ENDPOINT="http://cloud-nine-wallet-backend:3001/graphql" \
    -e CLOUD_NINE_WALLET_ADDRESS="https://cloud-nine-wallet-backend/accounts/gfranklin" \
    -e HAPPY_LIFE_BANK_WALLET_ADDRESS="https://happy-life-bank-backend/accounts/pfry" \
    grafana/k6 run /scripts/outgoing-payments-bench.js 2>&1
}

echo "[repeat] resetting stack for $LABEL" >&2
"${COMPOSE[@]}" down -v >/dev/null 2>&1
"${COMPOSE[@]}" up -d >/dev/null 2>&1
for _ in $(seq 1 60); do
  [[ "$(docker ps --filter name=backend --filter health=healthy -q | wc -l)" -ge 2 ]] && break
  sleep 5
done
sleep 30
echo "[repeat] warmup" >&2
run_k6 >/dev/null 2>&1

for i in $(seq 1 "$N"); do
  OUT=$(run_k6)
  JSON=$(echo "$OUT" | sed -n '/BENCH_JSON_BEGIN/,/BENCH_JSON_END/p' | sed '1d;$d')
  if [[ -z "$JSON" ]]; then
    echo "run $i: NO RESULT" >&2
    echo "$OUT" | tail -15 >&2
    continue
  fi
  echo "$JSON" | python3 -c 'import json,sys; print(json.load(sys.stdin)["throughput"]["payments_per_sec"])'
done
