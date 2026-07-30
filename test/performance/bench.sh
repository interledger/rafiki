#!/usr/bin/env bash
#
# Capacity benchmark runner for the outgoing-payment ingestion path.
#
# Sweeps a dimension matrix — topology x strategy x concurrency — because a
# single number hides the things that actually matter:
#
#   topology    peer | local     does the payment cross an ILP peer, or stay on
#                                one instance (which bypasses ILP entirely)
#   strategy    many-to-many |   how senders and receivers are paired, which is
#               fan-in |         what decides database and ledger lock
#               fan-out          contention
#   vus         concurrency
#
# Throughput numbers alone cannot identify a bottleneck, so every run also
# records server-side utilisation (container CPU) and database load (committed
# transactions per payment). A run that got faster while CPU-per-payment stayed
# flat did not get more efficient — it just got more cores.
#
# Usage:
#   ./bench.sh quick                      smoke test: one cheap run per topology,
#                                         no reset, no warmup. "does it work?"
#   ./bench.sh LABEL [--reset]            full matrix sweep
#
#   --reset   recreate the stack first. Use before each set being compared: the
#             payment tables grow monotonically, so a later run on a bigger
#             table is not a fair comparison.
#
# Select a subset with env vars, e.g.
#   TOPOLOGIES=local STRATEGIES="fan-in fan-out" VU_LEVELS=20 ./bench.sh mylabel
#
# Results: test/performance/results/LABEL.json
set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

LABEL="${1:?usage: bench.sh LABEL [--reset]   |   bench.sh quick}"
RESET="${2:-}"

RESULTS_DIR="$REPO_ROOT/test/performance/results"
mkdir -p "$RESULTS_DIR"

COMPOSE=(docker compose
  -f ./localenv/cloud-nine-wallet/docker-compose.yml
  -f ./localenv/happy-life-bank/docker-compose.yml
  -f ./localenv/merged/docker-compose.yml
  -f ./localenv/tigerbeetle/docker-compose.yml
  --env-file ./localenv/tigerbeetle/.env.tigerbeetle)

PG_CONTAINER=rafiki-shared-database-1
PG_DB=cloud_nine_wallet_backend

# Dimension matrix. Override any of these from the environment.
TOPOLOGIES="${TOPOLOGIES:-peer local}"
STRATEGIES="${STRATEGIES:-many-to-many fan-in fan-out}"
VU_LEVELS="${VU_LEVELS:-1 5 20}"
DURATION="${DURATION:-45s}"
# Repeats per matrix cell. A single 45s run cannot resolve a sub-20% difference;
# compare.py averages repeats and reports the spread so a claimed improvement can
# be checked against run-to-run noise.
REPEATS="${REPEATS:-1}"

log() { echo "[bench] $*" >&2; }

psql_q() {
  docker exec "$PG_CONTAINER" psql -U postgres -d "$PG_DB" -tAc "$1" 2>/dev/null
}

pg_xact() {
  psql_q "SELECT xact_commit + xact_rollback FROM pg_stat_database WHERE datname='$PG_DB';" | tr -d '[:space:]'
}

# Server-side clock, so run windows are not skewed by host-vs-container time.
pg_now() {
  psql_q "SELECT now();" | sed 's/^ *//;s/ *$//'
}

# Payments accepted by the API but not yet resolved by the send worker.
pg_in_flight() {
  psql_q "SELECT count(*) FROM \"outgoingPayments\" WHERE state IN ('FUNDING','SENDING');" | tr -d '[:space:]'
}

# Final states of the payments created during one run window.
pg_outcomes() {
  psql_q "SELECT state, count(*) FROM \"outgoingPayments\" WHERE \"createdAt\" >= '$1' AND \"createdAt\" < '$2' GROUP BY state;" |
    tr -d ' '
}

# Wait for the send worker to drain before measuring anything else.
#
# Payments are CREATED synchronously but SENT asynchronously, so a run's backlog
# keeps being processed after k6 exits. Without this, the next cell is measured
# on a system still working through the previous one, and the idle-load reading
# is inflated by leftover work rather than reflecting a quiet node.
SETTLE_SECS=0
settle() {
  local timeout="${SETTLE_TIMEOUT_S:-180}"
  local waited=0 in_flight
  SETTLE_SECS=0
  while true; do
    in_flight=$(pg_in_flight)
    [[ -z "$in_flight" || "$in_flight" == "0" ]] && break
    if [[ $waited -ge $timeout ]]; then
      SETTLE_SECS=$waited
      log "  !! settle timed out: ${in_flight} payments still in flight after ${timeout}s"
      log "     (the send worker cannot keep up with the ingestion rate)"
      return 1
    fi
    sleep 5
    waited=$((waited + 5))
  done
  SETTLE_SECS=$waited
  [[ $waited -gt 0 ]] && log "  settled in ${waited}s"
  return 0
}

# "30s" -> 30
duration_seconds() {
  local d="$1"
  case "$d" in
  *m) echo $(( ${d%m} * 60 )) ;;
  *s) echo "${d%s}" ;;
  *) echo "$d" ;;
  esac
}

run_k6() {
  local topology="$1" strategy="$2" vus="$3" duration="$4" mode="$5" label="$6"
  docker run --rm --network=rafiki_rafiki \
    -v "$REPO_ROOT/test/performance/scripts:/scripts" \
    -v "$REPO_ROOT/test/performance/dist:/dist" \
    -e TOPOLOGY="$topology" -e STRATEGY="$strategy" \
    -e VUS="$vus" -e DURATION="$duration" -e MODE="$mode" -e LABEL="$label" \
    -e SENDER_GQL_ENDPOINT="http://cloud-nine-wallet-backend:3001/graphql" \
    -e RECEIVER_GQL_ENDPOINT="http://happy-life-bank-backend:3001/graphql" \
    grafana/k6 run /scripts/outgoing-payments-bench.js 2>&1
}

extract_json() {
  sed -n '/BENCH_JSON_BEGIN/,/BENCH_JSON_END/p' | sed '1d;$d'
}

# ---------------------------------------------------------------- quick mode
# One short run per topology, both strategies left at the default. Exits
# non-zero if anything failed, so it works as a pre-commit sanity check on the
# harness itself. Deliberately does NOT reset or warm up: these numbers are not
# results and must never be reported as such.
if [[ "$LABEL" == "quick" ]]; then
  log "quick mode — smoke test only, results are NOT valid measurements"
  status=0
  for topology in $TOPOLOGIES; do
    log "--- $topology ---"
    out=$(run_k6 "$topology" "many-to-many" 1 "${QUICK_DURATION:-10s}" quick "quick-$topology")
    json=$(echo "$out" | extract_json)
    if [[ -z "$json" ]]; then
      log "!! no result block for $topology"
      echo "$out" | tail -25 >&2
      status=1
      continue
    fi
    # Note: % formatting, not f-strings. These snippets live inside a
    # single-quoted shell string, so escaped double quotes would reach Python as
    # literal backslashes, which is a syntax error inside an f-string expression.
    echo "$json" | python3 -c '
import json, sys
d = json.load(sys.stdin)
t, s = d["throughput"], d["slo"]
print("  %-6s %4d payments, %6s/s, %s failed  [%s]" % (
    d["dimensions"]["topology"], t["payments_total"], t["payments_per_sec"],
    d["failures"]["failed_reqs"], s["status"]))
for w in s["warnings"]:
    print("      WARN %s" % w)
for b in s["breaches"]:
    print("      FAIL %s" % b)
' || status=1
    failed=$(echo "$json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["failures"]["failed_reqs"])') || status=1
    [[ "$failed" != "0" ]] && status=1
  done
  log "quick mode done (exit $status)"
  exit $status
fi

# ---------------------------------------------------------------- full sweep
OUT="$RESULTS_DIR/${LABEL}.json"

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
  sleep 30 # let the mock ASEs finish seeding wallet addresses
fi

# Idle load: transactions/sec against Postgres with NO benchmark running.
# Should be near zero — the workers poll on 10-200ms timers and there is no work.
# A high number means a worker is busy-looping, which burns CPU and pool
# connections that the request path needs. Crisper signal than container CPU%.
# Drain first: an idle reading taken while a previous run's backlog is still
# being processed measures that backlog, not the idle system.
log "draining any in-flight payments before measuring idle load"
settle

log "measuring idle database load (10s, no load applied)"
IDLE_A=$(pg_xact); sleep 10; IDLE_B=$(pg_xact)
IDLE_TPS=$(((IDLE_B - IDLE_A) / 10))
log "  -> ${IDLE_TPS} transactions/sec at idle"

# Warmup, discarded. Without it the first measured run pays for cold in-memory
# caches (asset/wallet-address/fee/tenant, 15s TTL), unestablished GNAP grants,
# an empty exchange-rate cache and a cold JIT. Observed effect on a fresh stack:
# committed transactions per payment fell 64 -> 34 -> 30 across three successive
# runs, i.e. the system was still warming while being measured.
log "warmup (discarded): 60s at 5 VUs"
run_k6 peer many-to-many 5 60s full "${LABEL}-warmup" >/dev/null 2>&1
settle
sleep 5

{
  echo "{"
  echo "  \"label\": \"$LABEL\","
  echo "  \"git_sha\": \"$(git rev-parse --short HEAD)\","
  echo "  \"git_branch\": \"$(git rev-parse --abbrev-ref HEAD)\","
  echo "  \"idle_db_tps\": $IDLE_TPS,"
  echo "  \"runs\": ["
} >"$OUT"

first=1
overall_status=0
for topology in $TOPOLOGIES; do
  for strategy in $STRATEGIES; do
    for vus in $VU_LEVELS; do
     for repeat in $(seq 1 "$REPEATS"); do
      if [[ "$REPEATS" -gt 1 ]]; then
        log "=== $topology / $strategy / ${vus} VUs / $DURATION (repeat $repeat/$REPEATS) ==="
      else
        log "=== $topology / $strategy / ${vus} VUs / $DURATION ==="
      fi

      CPU_FILE=$(mktemp)
      (
        while true; do
          docker stats --no-stream --format '{{.Name}} {{.CPUPerc}}' 2>/dev/null |
            grep -E 'cloud-nine-backend|happy-life-backend|shared-database|tigerbeetle'
          sleep 1
        done
      ) >"$CPU_FILE" 2>/dev/null &
      CPU_PID=$!

      XACT_BEFORE=$(pg_xact)
      RUN_START=$(pg_now)
      K6_OUT=$(run_k6 "$topology" "$strategy" "$vus" "$DURATION" full \
        "$LABEL-$topology-$strategy-vus$vus")
      RUN_END=$(pg_now)
      XACT_AFTER=$(pg_xact)

      kill "$CPU_PID" 2>/dev/null
      wait "$CPU_PID" 2>/dev/null

      # Let this run's payments reach a terminal state before reading outcomes,
      # then attribute them by creation window. k6 only sees the four creation
      # calls return 200 — it is blind to a payment that is accepted and then
      # fails asynchronously, which is exactly what QuoteExpired looks like when
      # ingestion outruns the send worker.
      SETTLED=true
      settle || SETTLED=false
      DRAIN_SECS=$SETTLE_SECS
      OUTCOMES=$(pg_outcomes "$RUN_START" "$RUN_END")

      JSON=$(echo "$K6_OUT" | extract_json)
      if [[ -z "$JSON" ]]; then
        log "!! no result block for $topology/$strategy/vus$vus; tail of output:"
        echo "$K6_OUT" | tail -25 >&2
        rm -f "$CPU_FILE"
        overall_status=1
        continue
      fi

      CPU_JSON=$(awk '
        { gsub(/%/, "", $2); sum[$1] += $2; n[$1]++ }
        END {
          printf "{"; first = 1
          for (c in sum) {
            if (!first) printf ", "
            printf "\"%s\": %.1f", c, sum[c]/n[c]; first = 0
          }
          printf "}"
        }' "$CPU_FILE")
      rm -f "$CPU_FILE"

      [[ $first -eq 0 ]] && echo "," >>"$OUT"
      first=0
      SUMMARY=$(python3 - "$OUT" "$JSON" "$CPU_JSON" "$((XACT_AFTER - XACT_BEFORE))" \
        "$repeat" "$OUTCOMES" "$SETTLED" \
        "${COMPLETION_WARN_PCT:-0}" "${COMPLETION_FAIL_PCT:-5}" \
        "$DRAIN_SECS" "$(duration_seconds "$DURATION")" <<'PYEOF'
import json, sys

(out_path, k6_json, cpu_json, xact_delta, repeat,
 outcomes_raw, settled, warn_pct, fail_pct, drain_s, run_s) = (
    sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), int(sys.argv[5]),
    sys.argv[6], sys.argv[7] == 'true', float(sys.argv[8]), float(sys.argv[9]),
    int(sys.argv[10]), int(sys.argv[11])
)

r = json.loads(k6_json)
r['repeat'] = repeat
r['cpu_avg_pct'] = json.loads(cpu_json)

accepted = r['throughput']['payments_total']
r['db'] = {
    'xact_total': xact_delta,
    'xact_per_payment': round(xact_delta / accepted, 2) if accepted else None
}

# Terminal states of the payments this run created. `accepted` is what the API
# returned 200 for; `completed` is what actually moved money.
states = {}
for line in outcomes_raw.splitlines():
    if '|' in line:
        state, count = line.split('|', 1)
        states[state] = int(count)

total = sum(states.values())
completed = states.get('COMPLETED', 0)
failed = states.get('FAILED', 0)
in_flight = total - completed - failed
fail_rate = (failed / total * 100) if total else 0.0

r['completion'] = {
    'accepted': accepted,
    'observed': total,
    'by_state': states,
    'completed': completed,
    'failed': failed,
    'still_in_flight': in_flight,
    'failure_pct': round(fail_rate, 2),
    'settled': settled,
    'drain_seconds': drain_s,
    # Of the payments accepted per second, the share that actually completed.
    'completed_per_sec': (
        round(r['throughput']['payments_per_sec'] * completed / total, 2)
        if total else None
    ),
    # The honest capacity number. If accepting for 30s leaves the send worker
    # 75s of catch-up, the system did not sustain the accepted rate — it
    # sustained completed / (accept window + drain window). Ingestion outrunning
    # the worker shows up here and nowhere else.
    'sustained_per_sec': (
        round(completed / (run_s + drain_s), 2) if (run_s + drain_s) else None
    )
}

slo = r['slo']
# A run that needed a long catch-up did not sustain what it accepted. Warn when
# the drain exceeds the accept window; that is the signature of the send worker
# being the real ceiling.
if drain_s > run_s:
    slo['warnings'].append(
        'send worker needed %ds to drain a %ds run; sustained %s/s vs %s/s accepted'
        % (drain_s, run_s, r['completion']['sustained_per_sec'],
           r['throughput']['payments_per_sec'])
    )
if failed and fail_rate >= fail_pct:
    slo['breaches'].append(
        '%d/%d payments failed asynchronously (%.1f%% >= %.1f%%)'
        % (failed, total, fail_rate, fail_pct)
    )
elif failed and fail_rate > warn_pct:
    slo['warnings'].append(
        '%d/%d payments failed asynchronously (%.1f%%)' % (failed, total, fail_rate)
    )
if not settled:
    slo['breaches'].append(
        'send worker did not drain: %d payments still in flight' % in_flight
    )
slo['status'] = 'FAIL' if slo['breaches'] else ('WARN' if slo['warnings'] else 'OK')

with open(out_path, 'a') as f:
    f.write(json.dumps(r, indent=4))

# Report accepted and completed side by side; a run that accepts fast and then
# fails a quarter of its payments must not read as a clean result.
print('%s accepted/s -> %s sustained/s  (%d/%d ok, %d failed, %ds drain) [%s]' % (
    r['throughput']['payments_per_sec'], r['completion']['sustained_per_sec'],
    completed, total, failed, drain_s, slo['status']))
for w in slo['warnings']:
    print('    WARN %s' % w, file=sys.stderr)
for b in slo['breaches']:
    print('    FAIL %s' % b, file=sys.stderr)

sys.exit(2 if slo['status'] == 'FAIL' else 0)
PYEOF
      )
      MERGE_RC=$?

      log "  -> $SUMMARY"
      [[ $MERGE_RC -eq 2 ]] && overall_status=1
     done
    done
  done
done

{
  echo ""
  echo "  ]"
  echo "}"
} >>"$OUT"

log "written: $OUT"
[[ $overall_status -ne 0 ]] && log "one or more runs breached the ${SLO_FAIL_MS:-2000}ms p95 SLO"
exit $overall_status
