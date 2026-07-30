#!/usr/bin/env bash
#
# Capacity benchmark runner for the outgoing-payment ingestion path.
#
# Throughput numbers alone cannot identify a bottleneck, so every run also
# records server-side utilisation (container CPU) and database load (committed
# transactions per payment). A run that got faster while CPU-per-payment stayed
# flat did not actually get more efficient — it just got more cores.
#
# Usage:
#   ./bench.sh LABEL [--reset]
#
#   LABEL     name for this result set, e.g. "baseline" or "phase1"
#   --reset   recreate the stack from scratch first. Use this before each set
#             being compared: the payments tables grow monotonically across
#             runs, so a later run on a bigger table is not a fair comparison.
#
# Results are written to test/performance/results/LABEL.json
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LABEL="${1:?usage: bench.sh LABEL [--reset]}"
RESET="${2:-}"

RESULTS_DIR="$REPO_ROOT/test/performance/results"
mkdir -p "$RESULTS_DIR"
OUT="$RESULTS_DIR/${LABEL}.json"

COMPOSE=(docker compose
  -f ./localenv/cloud-nine-wallet/docker-compose.yml
  -f ./localenv/happy-life-bank/docker-compose.yml
  -f ./localenv/merged/docker-compose.yml
  -f ./localenv/tigerbeetle/docker-compose.yml
  --env-file ./localenv/tigerbeetle/.env.tigerbeetle)

PG_CONTAINER=rafiki-shared-database-1
PG_DB=cloud_nine_wallet_backend

# VU levels to sweep. 1 is kept only for continuity with historical numbers;
# 5 is near peak and 20 is past the knee.
VU_LEVELS=(1 5 20)
DURATION=45s

log() { echo "[bench] $*" >&2; }

pg_xact() {
  docker exec "$PG_CONTAINER" psql -U postgres -d "$PG_DB" -tAc \
    "SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname='$PG_DB';" 2>/dev/null | tr -d '[:space:]'
}

if [[ "$RESET" == "--reset" ]]; then
  log "resetting stack (down -v, up -d) — this wipes all data for a fair comparison"
  "${COMPOSE[@]}" down -v >/dev/null 2>&1
  "${COMPOSE[@]}" up -d >/dev/null 2>&1
  log "waiting for backends to become healthy and seed"
  for _ in $(seq 1 60); do
    healthy=$(docker ps --filter "name=backend" --filter "health=healthy" -q | wc -l)
    [[ "$healthy" -ge 2 ]] && break
    sleep 5
  done
  sleep 30   # let the mock ASEs finish seeding wallet addresses
fi

run_k6() {
  local vus="$1" duration="$2" label="$3"
  docker run --rm --network=rafiki_rafiki \
    -v "$REPO_ROOT/test/performance/scripts:/scripts" \
    -v "$REPO_ROOT/test/performance/dist:/dist" \
    -e SCENARIO=vus -e VUS="$vus" -e DURATION="$duration" -e LABEL="$label" \
    -e CLOUD_NINE_GQL_ENDPOINT="http://cloud-nine-wallet-backend:3001/graphql" \
    -e CLOUD_NINE_WALLET_ADDRESS="https://cloud-nine-wallet-backend/accounts/gfranklin" \
    -e HAPPY_LIFE_BANK_WALLET_ADDRESS="https://happy-life-bank-backend/accounts/pfry" \
    grafana/k6 run /scripts/outgoing-payments-bench.js 2>&1
}

# Idle load: transactions/sec against Postgres with NO benchmark running.
# Should be near zero — the workers poll on 10-200ms timers and there is no work.
# A high number means a worker is busy-looping, which burns CPU and pool
# connections that the request path needs. Crisper signal than container CPU%.
log "measuring idle database load (10s, no load applied)"
IDLE_A=$(pg_xact); sleep 10; IDLE_B=$(pg_xact)
IDLE_TPS=$(( (IDLE_B - IDLE_A) / 10 ))
log "  -> ${IDLE_TPS} transactions/sec at idle"

# Warmup, discarded. Without it the first measured run pays for cold in-memory
# caches (asset/wallet-address/fee/tenant, 15s TTL), unestablished GNAP grants,
# an empty exchange-rate cache and a cold JIT. Observed effect on a fresh stack:
# committed transactions per payment fell 64 -> 34 -> 30 across three successive
# runs, i.e. the system was still warming while being measured.
log "warmup (discarded): 60s at 5 VUs"
run_k6 5 60s "${LABEL}-warmup" >/dev/null 2>&1
sleep 5

echo "{" > "$OUT"
echo "  \"label\": \"$LABEL\"," >> "$OUT"
echo "  \"git_sha\": \"$(git rev-parse --short HEAD)\"," >> "$OUT"
echo "  \"git_branch\": \"$(git rev-parse --abbrev-ref HEAD)\"," >> "$OUT"
echo "  \"idle_db_tps\": $IDLE_TPS," >> "$OUT"
echo "  \"runs\": [" >> "$OUT"

first=1
for VUS in "${VU_LEVELS[@]}"; do
  log "=== VUS=$VUS duration=$DURATION ==="

  # Sample container CPU for the duration of the run.
  CPU_FILE=$(mktemp)
  (
    while true; do
      docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' 2>/dev/null \
        | grep -E 'cloud-nine-backend|happy-life-backend|shared-database|tigerbeetle'
      sleep 1
    done
  ) > "$CPU_FILE" 2>/dev/null &
  CPU_PID=$!

  XACT_BEFORE=$(pg_xact)

  K6_OUT=$(run_k6 "$VUS" "$DURATION" "$LABEL-vus$VUS")

  XACT_AFTER=$(pg_xact)
  kill "$CPU_PID" 2>/dev/null; wait "$CPU_PID" 2>/dev/null

  JSON=$(echo "$K6_OUT" | sed -n '/BENCH_JSON_BEGIN/,/BENCH_JSON_END/p' | sed '1d;$d')
  if [[ -z "$JSON" ]]; then
    log "!! k6 produced no result block for VUS=$VUS; tail of output:"
    echo "$K6_OUT" | tail -20 >&2
    rm -f "$CPU_FILE"
    continue
  fi

  CPU_JSON=$(awk '
    {
      gsub(/%/, "", $2)
      sum[$1] += $2; n[$1]++
    }
    END {
      printf "{"
      first = 1
      for (c in sum) {
        if (!first) printf ", "
        printf "\"%s\": %.1f", c, sum[c]/n[c]
        first = 0
      }
      printf "}"
    }' "$CPU_FILE")
  rm -f "$CPU_FILE"

  XACT_DELTA=$((XACT_AFTER - XACT_BEFORE))

  [[ $first -eq 0 ]] && echo "," >> "$OUT"
  first=0
  python3 - "$OUT" "$JSON" "$CPU_JSON" "$XACT_DELTA" <<'PYEOF'
import json, sys
out_path, k6_json, cpu_json, xact_delta = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4])
r = json.loads(k6_json)
r['cpu_avg_pct'] = json.loads(cpu_json)
payments = r['throughput']['payments_total']
r['db'] = {
    'xact_total': xact_delta,
    'xact_per_payment': round(xact_delta / payments, 2) if payments else None
}
with open(out_path, 'a') as f:
    f.write(json.dumps(r, indent=4))
PYEOF

  P=$(echo "$JSON" | python3 -c 'import json,sys; d=json.load(sys.stdin); print(d["throughput"]["payments_per_sec"])')
  log "  -> ${P} payments/s, ${XACT_DELTA} db transactions"
done

echo "" >> "$OUT"
echo "  ]" >> "$OUT"
echo "}" >> "$OUT"

log "written: $OUT"
