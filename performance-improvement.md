# Rafiki Outgoing Payment Performance — Status & Plan

**Last updated:** 2026-07-30
**Working branch:** `stephan-performance` (off `nl/batch-workers` @ `4f9ba6a7`)
**Environment:** single dev host; both Rafiki nodes, Postgres, TigerBeetle and k6 all co-resident and competing for the same cores

## 0. Targets and constraints

These are the ground rules the plan is built on. Everything downstream follows from
them, so they are stated first.

### Targets

| Environment                                                       | Target                 |
| ----------------------------------------------------------------- | ---------------------- |
| This dev machine (all services co-resident)                       | **≥ 250 payments/s**   |
| Production: 3-node Kubernetes cluster + separate Google Cloud SQL | **≥ 1,000 payments/s** |

### Latency SLO

| Scope                                   | Budget       |
| --------------------------------------- | ------------ |
| Any single Open Payments–level API call | **< 500 ms** |
| Full multi-call round trip              | **< 3 s**    |

**The SLO binds before the throughput ceiling does.** On peer traffic at 20 VUs the
system produces its best accepted rate but `createQuote` p95 is ~1,180 ms — well
past the warning line. At 5 VUs it is inside budget. Any number must therefore be
quoted as _throughput at p95 within SLO_, never raw throughput.

The harness now enforces this (§2): a run **fails** on p95 ≥ 2,000 ms and **warns**
at ≥ 500 ms, and the same gate covers asynchronous payment failures and a send
worker that cannot drain.

### Hard constraint: the API cannot change

- **The Open Payments API is fixed.** It is a public specification; we do not get to
  alter it.
- **The Admin API can change only with strong justification, and must stay backward
  compatible** — ASEs already integrate against it. Treat "avoid changing it" as the
  default.

This invalidates the original Phase 3. Bulk mutations and a `202`-plus-handle async
ingestion API were the largest single lever identified, and both are now off the
table in their original form. **The plan is restructured accordingly:** the work
moves to what can be changed — _internal_ execution, process topology, and the
per-payment cost behind an unchanged API surface.

### The avenue that replaces it: role-specialised processes

Deployment is Kubernetes, so running several instances of the same image with
different configuration is natural: some dedicated to quote work, some to incoming
payment workers, some serving the admin API. Locally the same shape can be modelled
as separate `docker compose` services. This needs no API change, and it directly
attacks the fact that one single-threaded Node process is the ceiling. It is now the
backbone of Phase 4 rather than an afterthought.

---

## 1. Where we are

### There are two separate ceilings, and the second one was invisible until now

Creating a payment is synchronous; **sending** it is not. The four admin mutations
return as soon as the payment is recorded, and a background worker moves the money
afterwards. The benchmark only ever watched those four calls return 200, so it
measured how fast the API says _yes_ — not how fast the system clears work.

Measuring drain time after each run makes the gap visible:

| topology | VUs | accepted/s | **sustained/s** | drain after a 30 s run |
| -------- | --- | ---------- | --------------- | ---------------------- |
| peer     | 5   | 10.82      | **7.31**        | 15 s                   |
| peer     | 20  | 12.84      | **6.55**        | 30 s                   |
| local    | 40  | 78.34      | **22.81**       | 75 s                   |

`sustained/s = completed ÷ (accept window + drain window)` — the rate at which the
system actually clears payments. Accepted rate overstates real capacity by **1.5×
on peer and 3.4× on local**.

Two consequences, and they reorder the plan:

1. **The send worker is a distinct, currently binding ceiling** — ~7/s for peer and
   ~23/s for local, against ingestion of ~11/s and ~78/s respectively. Making
   `createQuote` free would raise the accepted rate and do nothing for the sustained
   rate. `OUTGOING_PAYMENT_WORKERS` is 1 with batch size 1.
2. **Peer sustained throughput gets _worse_ with more concurrency** (7.31 → 6.55 from
   5 to 20 VUs) while latency breaches the SLO. Past ~5 VUs, peer load is pure queue
   growth.

### Status

|                       |                                                                            |
| --------------------- | -------------------------------------------------------------------------- |
| Sustained today       | **~7/s peer**, **~23/s local** (accepted: ~11/s and ~78/s)                 |
| Target here           | **250/s** → gap **~11× local, ~34× peer**                                  |
| Target in production  | **1,000/s** on 3 nodes + Cloud SQL                                         |
| Ceiling 1 — ingestion | Per-payment CPU; on peer, dominated by the ILP rate probe in `createQuote` |
| Ceiling 2 — send      | Single background worker, batch size 1                                     |
| Not the constraint    | TigerBeetle (~3%), Postgres CPU (~55%), sender/receiver lock contention    |
| Blocked route         | Bulk/async ingestion — the API cannot change (§0)                          |

Phase 0 (measurement), Phase 1 (remove waste) and Phase 1.5 (correctness bugs) are
done and verified. Phase 1 bought +9.4% accepted throughput and −54% to −89%
database work per payment.

**How the remaining gap decomposes.** Four factors, and missing any one misses the
target:

| Factor                        | Today                   | Needed              | Phase  |
| ----------------------------- | ----------------------- | ------------------- | ------ |
| Send worker capacity          | ~7/s peer, ~23/s local  | ≥ target rate       | **2a** |
| Ingestion cost per payment    | ~40 ms CPU, ~18 queries | ~10 ms, < 8 queries | 2b / 3 |
| Concurrency before SLO breach | ~5 in flight (peer)     | 100+                | 2b / 4 |
| Processes doing the work      | 1 (single-threaded)     | N, role-specialised | 4      |

**Latency share is not CPU share — keep these separate.** `createQuote`'s 80% is a
share of _wall-clock latency_, and much of it is the backend **waiting** on the ILP
pacer's ~25 ms inter-packet delays rather than burning event-loop time. Waiting
consumes no CPU. The probe does drag real CPU with it (packet encode/decode,
per-packet HMACs, and until Phase 1 ~11 peer lookups), but the split has not been
measured directly. The peer-vs-local comparison now bounds it from outside: removing
ILP entirely raises accepted throughput ~7× (11 → 78/s), so ILP dominates the
ingestion path — but it lifts sustained throughput only ~3× (7 → 23/s), because the
send worker then becomes the limit.

**The one-line version:** we are not bound by the ledger or the database. Ingestion
is bound by per-payment CPU in a single-threaded Node process — on peer traffic,
mostly an ILP rate probe re-deriving static peer configuration every time — and
end-to-end throughput is bound by a single background send worker behind it.

### A caveat that governs every number in this document

Absolute numbers move with the environment: a **fresh-reset** stack measures lower
than a **warm long-lived** one (~11/s vs ~19/s accepted on the same peer build), and
a co-resident load generator depresses everything. Every before/after pair was
captured in the same environment, back to back. Never compare a number from one
table against a number in another; compare within a table, or re-measure.

---

## 2. How we measure (Phase 0 — done)

This came first because nothing else could be trusted until it existed.

### What was wrong with the old harness

`test/performance/scripts/create-outgoing-payments.js` runs `vus: 1`. With one
virtual user the reported `iterations/s` is arithmetically identical to
`1000 / iteration_duration_ms` — it is a **serial latency** measurement wearing a
throughput label. Verified across three historical runs to three significant figures:

| Run                | iteration avg | reported iterations/s | `1000 / duration` |
| ------------------ | ------------- | --------------------- | ----------------- |
| main baseline      | 109.79 ms     | 9.11                  | 9.11              |
| `v2.4.4-de`        | 132.93 ms     | 7.52                  | 7.52              |
| `nl/batch-workers` | 130.89 ms     | 7.64                  | 7.64              |

A change that doubled concurrent capacity without changing single-request latency
would show **zero** improvement. This is why the batching work appeared to do
nothing: the instrument could not see it.

It also caused a false alarm. The "17% regression on `v2.4.4-de`" was an artifact —
the k6 script gained a fourth mutation (`depositOutgoingPaymentLiquidity`) on that
branch, so it did 33% more work per iteration. **Per request the branch was 10.8%
faster** (36.25 ms → 32.33 ms). Always `git diff` the test script before comparing
baselines.

### The harness now

One parameterised script, not a copy per scenario. The previous copies drifted
apart and the local-payment one silently bit-rotted against a schema change
(`edge.node.url` when the field had become `address`), so local payments were
never actually measured.

| File                                                  | Purpose                                                                                                                                                  |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/performance/scripts/outgoing-payments-bench.js` | The benchmark. Dimensions via env; per-mutation request tags; SLO thresholds; machine-readable `BENCH_JSON_BEGIN/END` summary.                           |
| `test/performance/bench.sh`                           | Runner: matrix sweep, `--reset`, idle-load measurement, warmup, settle, completion tracking, CPU sampling, database transactions per payment, `REPEATS`. |
| `test/performance/compare.py`                         | Diffs two result files, matching runs on their full dimension tuple. Aggregates repeats and reports spread.                                              |

**Dimensions.** Every scenario is a point in this space, and every result records
where it came from:

| Dimension  | Values                                  | Why it matters                                                                                                                                                                                                                                                                                                       |
| ---------- | --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `TOPOLOGY` | `peer` \| `local`                       | `createReceiver` resolves a local URL to a local incoming payment and a foreign URL to a remote one, so the four-mutation flow is identical and only the receiver address changes. `local` selects the LOCAL payment method and bypasses ILP entirely — making peer-vs-local a direct measurement of what ILP costs. |
| `STRATEGY` | `many-to-many` \| `fan-in` \| `fan-out` | How senders and receivers are paired, which is what would drive database and ledger lock contention. `fan-in` = many senders to one receiver; `fan-out` = one sender to many receivers.                                                                                                                              |
| `VUS`      | concurrency                             |                                                                                                                                                                                                                                                                                                                      |
| `MODE`     | `quick` \| `full`                       | `quick` is a smoke test — 1 VU, ~10 s, no reset, no warmup, fails on any error. For "does this run at all", never for reporting.                                                                                                                                                                                     |

`setup()` builds wallet-address pools sized to the VU count, creating `perf-snd-N` /
`perf-rcv-N` addresses on whichever instance owns them (including through the
peer's admin API). Each VU keeps one pairing for the whole run, so a fan-in run
really does drive every payment at one receiver.

```bash
./test/performance/bench.sh quick                  # ~30s smoke test
./test/performance/bench.sh baseline --reset       # full matrix
TOPOLOGIES=local VU_LEVELS=40 REPEATS=3 ./test/performance/bench.sh x
python3 test/performance/compare.py results/{baseline,phase2}.json
```

### What the harness enforces, and why

- **Warm up and discard.** Without it, database transactions per payment fell
  64 → 34 → 30 across three successive runs — the system was still warming while
  being measured.
- **`--reset` before each compared set.** Payment tables grow monotonically; a
  later run on a bigger table is not a fair comparison.
- **Settle before measuring anything.** Payments are created synchronously and sent
  asynchronously, so a run's backlog keeps draining after k6 exits. Without a drain
  step the next cell is measured on a system still working through the previous
  one, and the idle reading measures leftover work rather than a quiet node
  (observed drifting 92 → 244 → 292 → 315 tx/s across runs).
- **Report completion, not acceptance.** Each run records a server-side time window
  and queries the terminal state of the payments created in it. A run that accepts
  fast and then fails payments asynchronously must not read as clean.
- **Measure work, not just speed.** Throughput alone cannot distinguish "more
  efficient" from "given more CPU". Database transactions per payment and CPU are
  what have to fall for the system to scale.
- **Measure idle load.** Transactions/sec with no load applied exposes background
  waste that hides inside CPU percentages. This is what caught the busy loop.
- **Repeat before believing a sub-20% delta.** A single 45 s run cannot resolve it.
  `REPEATS=N`; `compare.py` averages and prints the spread.

**SLO gate.** A run **fails** on p95 per call ≥ 2,000 ms, on ≥ 5% of payments failing
asynchronously, or on the send worker failing to drain. It **warns** at p95 ≥ 500 ms,
on any asynchronous failures at all, and when the drain window exceeds the accept
window — the signature of ingestion outrunning the worker.

### Still outstanding

- Move the load generator **off** the system under test. k6 currently competes with
  both nodes and Postgres for cores, which depresses every number.
- **Replace drain-based `sustained/s` with a steady-state measurement.** The current
  figure is a lower bound: the drain phase has no arrivals, so the worker is
  clearing a shrinking queue under different conditions, and draining to fully empty
  includes the tail. The rigorous version holds a constant arrival rate and checks
  whether in-flight depth stabilises or grows without bound. The `ramping-arrival-rate`
  scenario exists for this. Do it before quoting a capacity number outside the team.
- Drain polling is every 5 s, so `drain_seconds` is granular to ±5 s.
- Currency is not yet a dimension; the seeds have USD/EUR/MXN/JPY, and cross-currency
  forces real rate conversion.
- `process_pending_payment_ms` telemetry now times a whole batch rather than one
  payment, so dashboards are not comparable across the `nl/batch-workers` boundary.

---

## 3. What we know about the system

### 3.1 Peer traffic stops scaling at ~5 concurrent; local does not

Warm long-lived stack, 45 s runs, **peer** topology:

| VUs   | accepted/s | iteration p50 | failures |
| ----- | ---------- | ------------- | -------- |
| 1     | 7.5        | 131 ms        | 0        |
| **5** | **18.9**   | 254 ms        | 0        |
| 20    | 17.6       | 1.13 s        | 0        |
| 50    | 14.3       | 3.46 s        | 0        |

Past ~5 concurrent, accepted throughput **falls** while latency grows
super-linearly, with **zero errors** — pure queueing, not failures.

**This is peer-specific.** On `local` the same sweep keeps climbing: ~50/s accepted
at 5 VUs, ~80/s at 40 VUs. So it is not a general concurrency limit in the request
path; it is the ILP creation path saturating.

Two corrections to how this was originally read:

- These runs predate the harness restructure, so they were **fan-in and fan-out
  simultaneously** — every payment `gfranklin → pfry`, the maximally contended
  pairing and the only one ever measured. Contention was a natural suspect; it has
  since been ruled out (§3.5).
- They report **accepted** throughput. Sustained rates are far lower (§1).

### 3.2 The bottleneck is Node CPU, not the datastores

CPU during a 20-VU run:

| Component                 | CPU      | Verdict       |
| ------------------------- | -------- | ------------- |
| happy-life-backend (Node) | 115–182% | **saturated** |
| cloud-nine-backend (Node) | 94–128%  | **saturated** |
| Postgres                  | 40–55%   | headroom      |
| TigerBeetle               | 1.4–3%   | idle          |

Node runs JS on one thread, so ~100%+ means the event loop is the constraint. Any
plan that starts by optimising the database or the ledger is optimising the wrong
layer. Note the _receiving_ node is busier — it absorbs incoming-payment creation,
two receiver `GET`s per payment, and all ILP packets.

### 3.3 `createQuote` dominates the creation path — in latency

Making one payment is four sequential HTTP requests. Post-Phase-1, 1 VU, fresh stack:

| Mutation                          | avg          | share of latency |
| --------------------------------- | ------------ | ---------------- |
| `createReceiver`                  | 25.8 ms      | 7%               |
| **`createQuote`**                 | **287.8 ms** | **80%**          |
| `createOutgoingPayment`           | 30.3 ms      | 8%               |
| `depositOutgoingPaymentLiquidity` | 13.7 ms      | 4%               |
| _sum_                             | _357.6 ms_   |                  |

The four mutations sum to 357.6 ms against a measured iteration p50 of 359.4 ms, so
essentially all the wall-clock time is these four calls — no meaningful client-side
overhead. This confirms the team's instinct that creation-phase ingestion is the
bottleneck, and localises it.

The share falls as concurrency rises — 80% at 1 VU, 72% at 5, 54% at 20 — because
queueing delay inflates every mutation once the system saturates. The 1-VU figure is
the cleanest read of intrinsic cost. (On the warm long-lived stack `createQuote`
measured 67 ms / 56% — same conclusion, different environment.)

The cost is the **ILP rate probe**: probe packets emitted serially at ~25 ms
intervals by the pacer in `@interledger/pay` (`1000/40 = 25 ms`). F08 rejects from
the peer's max-packet middleware are not "authentic" STREAM replies, so the
packets-per-second ramp never engages and every packet pays the full interval. Each
probe packet also used to trigger an uncached `SELECT … FROM peers WHERE id = ?`
(fixed in Phase 1).

> **Do not read this as 80% of the CPU cost.** Throughput is bound by CPU (§3.2),
> and much of the 288 ms is the backend _waiting_ on pacer timers, which does not
> occupy the event loop. The probe does carry genuine CPU — packet encode/decode,
> per-packet HMACs, and formerly the peer lookups — but the waiting/working split is
> **unmeasured**. Removing the probe is certain to cut latency and per-VU
> throughput; how much CPU it frees is an open question, and the first task of
> Phase 2 is to answer it.

### 3.4 The batching work is inert as shipped

| Config                             | Env var                               | Default |
| ---------------------------------- | ------------------------------------- | ------- |
| `outgoingPaymentBatchSize`         | `OUTGOING_PAYMENT_WORKER_BATCH_SIZE`  | **1**   |
| `incomingPaymentBatchSize`         | `INCOMING_PAYMENT_WORKER_BATCH_SIZE`  | **1**   |
| `webhookWorkerBatchSize`           | `WEBHOOK_WORKER_BATCH_SIZE`           | **1**   |
| `outgoingPaymentWorkerConcurrency` | `OUTGOING_PAYMENT_WORKER_CONCURRENCY` | 10      |
| `walletAddressBatchSize`           | `WALLET_ADDRESS_BATCH_SIZE`           | 250     |

These env vars are referenced in exactly one file — `config/app.ts`. No compose
file, no chart, no `.env`; `docker exec … printenv` on the running backend confirms
none are set. With batch size 1, `chunk = min(1, 10) = 1`, so the concurrency knob
is dead code at runtime.

**This fully explains the mixed results.** For the outgoing, incoming and webhook
paths the branch is behaviourally identical to `main`. The only changed default was
`walletAddressBatchSize: 250`, which activated the busy loop fixed in Phase 1.

A note on where batching was aimed. The original reading was that it targeted the
wrong layer, because the ceiling looked like the synchronous ingestion path. That is
only half right: **the background worker is itself a hard ceiling** (§1), so batching
those workers was aimed at a real constraint. It just could not help while shipped at
batch size 1, and the harness could not have detected it either way.

### 3.5 Lock contention is not currently a factor

The `strategy` dimension exists to separate independent payments from ones sharing a
sender or a receiver, since those are what would contend on wallet-address rows and
liquidity accounts. Measured on `local`:

| VUs | many-to-many | fan-in  | fan-out |
| --- | ------------ | ------- | ------- |
| 5   | 49.67/s      | 49.83/s | 50.06/s |
| 40  | 80.34/s      | 81.95/s | 81.51/s |

Identical within noise, with database transactions per payment flat at ~14.5 across
all three. **Sender/receiver contention is not a limiter at this scale** — CPU and
the send worker saturate first.

This is a useful negative result twice over: it removes contention from the suspect
list for the §3.1 concurrency ceiling, and it means the pre-restructure benchmark's
accidental fan-in+fan-out pairing did not bias the historical numbers. The dimension
stays instrumented, because contention is exactly the kind of thing that surfaces
once the current ceilings are lifted.

### 3.6 ILP dominates the creation path — measured, not inferred

`local` payments bypass the ILP connector and its rate probe entirely
(`quote/service.ts` selects `receiver.isLocal ? 'LOCAL' : 'ILP'`), so peer-vs-local
prices ILP directly:

|                            | peer | local | ratio  |
| -------------------------- | ---- | ----- | ------ |
| accepted/s (1 VU smoke)    | 2.7  | 21.8  | **8×** |
| accepted/s (best observed) | ~13  | ~80   | **6×** |
| sustained/s                | ~7   | ~23   | **3×** |

Removing ILP raises ingestion by roughly 6–8×, confirming it dominates the creation
path. But it lifts _sustained_ throughput only ~3×, because the send worker then
becomes the limit. Both numbers matter: the first sizes Phase 2, the second says
Phase 2 alone cannot reach the target.

---

## 4. What has been done (Phase 1)

All on `stephan-performance`, all verified. Seven files changed, ~96 insertions.

### 4.1 Changes

**1. Wallet-address worker busy loop — the biggest waste found.**
`processNext` returned `walletAddresses.map(w => w.id)`, i.e. `[]` when idle. In
`app.ts`:

```ts
if (hasMoreWork) process.nextTick(() => this.processWalletAddress())
else setTimeout(() => this.processWalletAddress(), idle).unref()
```

`[]` is **truthy**, so the worker took the `process.nextTick` path forever, issuing
`BEGIN`/`SELECT … FOR UPDATE SKIP LOCKED`/`COMMIT` every tick and never reaching the
200 ms sleep. Only this worker had the bug; outgoing, incoming and webhook all
correctly return `undefined`. Now returns `undefined` when empty, matching them.
Regression test added.

**2. Peer read-through cache.**
`getPeer` was called once per ILP packet via `getPeerByDestinationAddress` and was
the highest-QPS statement in the system (~11 of the ~26 queries per payment). Every
other hot entity — asset, wallet address by id, fee, tenant — already had a
`CacheDataStore`; `Peer` was the outlier. Follows the `assetCache` idiom exactly.
Invalidated **after commit** on update and delete (delete rather than write-through,
so a rolled-back transaction cannot leave uncommitted state cached).

**3. Redis `EXPIRE` unit bug.**
The admin-API signature replay guard passed **milliseconds** to `EXPIRE`, which
takes **seconds** — a 30-second TTL became 8.3 hours. The keyspace grew ~4 keys per
payment and retained them all day (~120M keys at 1,000 TPS).

**4. `OPEN_PAYMENTS_VALIDATE_RESPONSES` config flag.**
AJV validation of every Open Payments response is measurable CPU on the saturated
resource. But these responses come from _other organisations' servers_, so
validation is a real defence. Made configurable, **defaulting to `true`** —
behaviour unchanged, the saving is available and explicit for operators who accept
the trade-off.

**5. Pre-existing test flake fixed.**
`test.each` tables are evaluated when the describe block is **registered**, so a
`new Date(Date.now() + 60_000)` literal in the table goes stale and lands in the
past whenever the suite takes over a minute to reach it. Two "not ready" cases now
build the date inside the test body.

### 4.2 Results

Same harness, `--reset`, discarded warmup, identical methodology both sides.

**Idle database load** — zero load applied, no wallet addresses due:

|            | tx/sec     |
| ---------- | ---------- |
| Pre-change | **~1,950** |
| Phase 1    | **~95**    |

**−95%.** Pure waste: ~1,950 pointless transactions per second on an idle node.

**Throughput at peak concurrency** (5 VUs, 45 s, 3 repeats each):

| Build    | runs                | mean        | sd   |
| -------- | ------------------- | ----------- | ---- |
| baseline | 9.96, 10.03, 10.08  | 10.02/s     | 0.06 |
| phase1   | 10.73, 11.09, 11.07 | **10.96/s** | 0.20 |

**+9.4%**, distributions non-overlapping (worst phase1 10.73 > best baseline 10.08).
A single-run comparison suggested +15.7%; the repeated measurement is the honest one.

**Work per payment** — the number that matters for scaling:

| VUs | db transactions/payment | change   |
| --- | ----------------------- | -------- |
| 1   | 486.6 → 51.5            | **−89%** |
| 5   | 68.0 → 21.6             | **−68%** |
| 20  | 39.3 → 18.2             | **−54%** |

**CPU at 1 VU** (unsaturated, so it reflects real work): cloud-nine 104%→53%,
happy-life 112%→52%, Postgres 79%→29%. Zero failed requests in every run.

### 4.3 Correctness

| Check                                  | Result                                  |
| -------------------------------------- | --------------------------------------- |
| Full backend suite                     | **2,612 passed, 0 failed** (111 suites) |
| Same suite, pre-change                 | 4 failed — Phase 1 is strictly better   |
| `pnpm check:lint` (`--max-warnings=0`) | clean                                   |
| `pnpm check:prettier`                  | clean                                   |
| `pnpm --filter backend build`          | clean                                   |

### 4.4 Honest read

The efficiency wins are large and unambiguous. The throughput win is real but
modest — and that is the **expected** shape, because Phase 1 only removes waste. At
20 VUs both backends are still pinned near 125%, so the system remains CPU-bound at
~11 payments/s. `createQuote` has not been touched.

Phase 1's real contribution toward 1,000 TPS is that it removes 54–89% of the
database work every payment carries into the later phases, and frees roughly a core
per node that the busy loop was burning. It is groundwork, not the win.

### 4.5 Deliberately not done, with reasons

Four items from the original Phase 1 list were skipped after reading the code. They
are listed here so nobody "finishes" them without re-deciding:

- **Removing the duplicate receiver fetch.** `createOutgoingPayment` re-resolves the
  receiver, which looked redundant — but it is a genuine **validation**: it checks
  `receiver.isActive()` before committing, and a quote can be minutes old by then.
  Removing it trades correctness for benchmark score. _A short-TTL receiver cache
  would collapse the back-to-back duplicate while preserving the check for real
  flows_ — worth doing in Phase 2, as a deliberate decision.
- **Skipping the always-miss local incoming-payment lookup.** Deciding "is this URL
  local" means comparing the parsed resource-server URL against this node's own, but
  tenants can carry their own resource-server URLs. Not safe without settling the
  multi-tenancy rules; saves ~1–2 queries/payment against the peer cache's ~11.
- **`addSentAmount(…, 0n)` in `fundPayment`.** Verified safe (`Funding` is only
  entered at creation, so `getTotalSent` is always 0 there) — but TigerBeetle runs at
  ~2–3%, so it saves nothing measurable while touching money-adjacent reporting.
- **Moving TigerBeetle calls out of the Postgres transaction in `fundPayment`.**
  Changes transactional semantics around money movement. Belongs in its own reviewed
  change, not bundled into a perf sweep.

---

## 5. The next phases

**Sequencing has changed.** The discovery that the send worker is a separate,
currently binding ceiling (§1) means Phase 2 on its own cannot move end-to-end
throughput: making `createQuote` free raises the _accepted_ rate and leaves the
_sustained_ rate where it is. The two ceilings have to come down together.

Revised order of attack:

| Order  | Work                                                                  | Why here                                                                                                                   |
| ------ | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **2a** | Raise send-worker capacity (Phase 4 items 1–4, pulled forward)        | It is the binding ceiling for both topologies today. Nothing else shows up in sustained throughput until it moves.         |
| **2b** | Make `createQuote` cheap (Phase 2)                                    | The binding ceiling on _peer_ ingestion, ~6–8× per §3.6, and it buys the SLO headroom needed to run at higher concurrency. |
| **3**  | Internal efficiency behind an unchanged API (Phase 3)                 | Broad per-payment cost reduction; helps both ceilings.                                                                     |
| **4**  | Full role-specialised topology and horizontal scale (rest of Phase 4) | Converts per-node efficiency into the target.                                                                              |

2a and 2b are largely independent and could run in parallel by different people.

**Still do not simply add replicas first.** Multiplying a ~18-query-per-payment
workload across processes hits the Postgres wall; the point of pulling worker
capacity forward is to fix _why_ one worker is slow, not to paper over it.

### Phase 2 — Make `createQuote` cheap

**Why:** it is 80% of creation latency, and §3.6 now prices the whole ILP path from
outside — removing it (via `local`) raises accepted throughput **6–8×**. That is the
ceiling on what this phase can deliver for ingestion.

**The prize is now partly sized, with one caveat left.** §3.6 bounds the _total_ ILP
cost, but not the split between the probe's pacer waiting (frees no CPU when removed)
and its real work (packet encode/decode, per-packet HMACs). The 6–8× is also an upper
bound for this phase specifically, since `local` skips more than just the probe.
Step 1 still exists, but it is now a narrower question: how much of the measured ILP
cost is the _probe_ rather than the rest of the ILP send path.

**And note the hard limit:** even a perfect Phase 2 lifts sustained throughput only
to whatever the send worker can clear — ~23/s today (§1). This phase must be paired
with 2a to show up in end-to-end numbers.

**The insight:** the rate probe re-derives _static peer configuration_ on every
payment. `maxPacketAmount` is a column on the peer record. Exchange rates are
already cached with a 15 s TTL. The probe is discovering facts the system already
knows.

**Approach, in order:**

1. **Instrument first.** Add timing around the probe specifically, so you can prove
   what fraction of `createQuote`'s 288 ms is pacing delay versus packet handling
   versus persistence. Do not optimise on the current inference alone.
2. **Cache probe outcomes**, keyed by (peer, asset pair, amount bucket), with a
   short TTL. Steady-state traffic between the same two nodes should not probe at
   all. This is the highest-value item and is self-contained.
3. **Add a fast path** for same-asset, same-scale transfers where no rate discovery
   is needed. Common in practice and skips the probe entirely.
4. **Fix the pacer ramp** — F08 rejects are classified inauthentic so the
   packets-per-second ramp never engages, making every probe packet pay the full
   25 ms. This is upstream in `@interledger/pay`; either contribute a fix or bypass
   pacing for probe traffic. Slowest to land, so start it early in parallel.
5. **Short-TTL receiver cache** (see §4.5) to collapse the duplicate cross-node
   fetch while preserving the `isActive()` validation.
6. **Make quote reuse a first-class API capability.** Nathan's premade-quotes script
   already points here; it should be a supported flow, not a test fixture.

**Watch out for:** correctness of cached quotes. A stale `maxPacketAmount` or rate
produces a quote that fails at send time. Bound TTLs conservatively and make the
send path tolerate a stale-quote rejection cleanly.

**Exit criteria:** `createQuote` is no longer the majority of creation latency, and
peak throughput rises materially above 11/s on the standard harness.

### Phase 3 — Internal efficiency behind an unchanged API

**This phase was rewritten.** It previously proposed bulk mutations and `202`-plus-
handle async ingestion. Both required changing the API and are now ruled out (§0).
What survives is everything that reduces per-payment cost _behind_ the existing
request/response contract — the caller still makes the same four calls and still
gets the same synchronous answers.

**Why it still matters:** each payment currently pays four signature verifications,
roughly eleven Redis round trips of bookkeeping, four separate database
transactions, and one TigerBeetle transfer against a ledger sized for batches of
thousands. None of that is mandated by the API shape; it is how the server happens
to service it.

**Approach:**

1. **Cheapen the admin-API envelope.** Every mutation pays HMAC verification, two
   Redis round trips for replay protection, and ApolloArmor cost analysis before any
   business logic runs. Measure the envelope in isolation, then attack it — a single
   round-trip replay guard (`SET NX` returning whether it was new, instead of `GET`
   then `SET`) halves the Redis traffic on its own.
2. **Internal request coalescing.** Concurrent payments to the same receiver, asset
   pair or tenant repeat identical lookups. The rates service already coalesces
   in-flight requests; the same pattern applies to receiver resolution and tenant
   settings. Invisible to the caller.
3. **Batch TigerBeetle transfers across concurrent requests.** A short accumulation
   window (single-digit milliseconds) that groups transfers from separate in-flight
   requests into one `createTransfers` call. Each caller still awaits its own result,
   so the API contract is unchanged, but the ledger goes from one transfer per
   request to one per window. This is the closest available substitute for the bulk
   mutation, and TigerBeetle is built for exactly this.
4. **Trim transaction scope.** Move external I/O (TigerBeetle, HTTP) out of Postgres
   transactions — `fundPayment` currently holds a `FOR UPDATE` row lock across three
   TigerBeetle round trips while occupying one of 20 pool connections. Shorter
   transactions mean more concurrent requests per connection.

**Watch out for:** micro-batching (item 3) adds latency by design — the accumulation
window is a direct latency-for-throughput trade. Keep the window well inside the
500 ms per-call budget and make it configurable so it can be turned off. Item 4
changes transactional semantics around money movement and wants its own review.

**If a _backward-compatible additive_ admin API change is ever sanctioned**, the
single highest-value addition remains a composite mutation performing
receiver + quote + payment + funding in one call: it removes 3 round trips, 3
signature verifications and ~6 Redis round trips per payment, and existing mutations
keep working untouched. Recorded here as the option to revisit, not as planned work.

**Exit criteria:** per-payment CPU and Redis/database round trips fall measurably
with no change to the API surface.

### Phase 4 — Role-specialised processes and horizontal scale

**Now the backbone of the plan, not an afterthought** — with the API-change route
closed, process count carries more of the multiplier. It was only safe to attempt
once the §6 correctness bugs were fixed.

> **Items 1, 3, 4 and 5 below are Phase 2a and should start now.** They are what
> raises send-worker capacity, which §1 shows is the binding ceiling on sustained
> throughput. The remainder — the full role-specialised topology and scaling out —
> still belongs after Phase 2b.
>
> **Profile the worker before changing it.** We know it clears ~7/s (peer) and ~23/s
> (local) with one loop at batch size 1, but not _why_. If its per-payment cost is
> the ILP send path, it shares a root cause with Phase 2b; if it is claim-query
> overhead or transaction serialisation, item 4 is the fix. That measurement decides
> how much of 2a is real work.

**The core idea (per the deployment model):** run several instances of the same
image with different configuration, each doing a subset of the work. Kubernetes
makes this natural; locally the same shape is modelled as separate `docker compose`
services.

**Approach:**

1. **Make roles configurable.** Today every process runs every worker — the admin
   API, the Open Payments server, and all four worker loops share one event loop, so
   worker CPU steals from request-serving CPU. Introduce a role switch (worker counts
   already exist as env vars; setting them to 0 is most of the mechanism) so a
   deployment can run, say, API-only instances plus dedicated outgoing-payment,
   incoming-payment and webhook instances.
2. **Model it locally in `docker compose`** as separate services against the shared
   database, so the topology is testable on this machine and the 250/s target is
   measured against the shape that will actually be deployed.
3. **Verify the claim mechanism is safe under real parallelism.** `FOR UPDATE SKIP
LOCKED` should already guarantee disjoint claims across instances, but it has
   never been exercised with more than one worker process — test it explicitly
   before relying on it.
4. **Restructure the worker claim** so each payment runs in its own transaction:
   claim by _marking_ rows rather than holding `FOR UPDATE` locks for the batch's
   lifetime. This removes the residual batch-abort noted in §6.2, ends the
   serialisation of every in-batch write onto one connection, and is a precondition
   for large batch sizes being useful.
5. **Then enable batching** — set the batch-size env vars and add them to the compose
   files and charts so the feature is actually exercised rather than shipped inert.
6. **Raise `DATABASE_POOL_MAX`** (currently 20, shared by the APIs, every worker and
   Postgres-mode accounting) in step with process count, and size Cloud SQL's
   connection limit accordingly.

**Note on what batch size actually buys:** throughput ≈
`workers × min(concurrency / T_pay, 1 / D)`. Batch size does not appear —
**concurrency and worker count are the levers**. Batch size only amortises the claim
query and the commit. This is the arithmetic reason the batching branch showed mixed
results, and why role-specialised processes are the more promising direction.

**Exit criteria:** throughput scales roughly linearly with process count; 250/s
within SLO on this machine; the same topology projects to 1,000/s on three nodes.

---

## 6. Phase 1.5 — correctness bugs (done)

Fixed before any further performance work, on the reasoning that batching and
horizontal scale both _amplify_ these: every one of them is either latent today only
because batch sizes default to 1, or gets worse with concurrency. Shipping Phase 2
or 4 on top of them would have turned quiet bugs into loud ones.

Each is recorded below with root cause, impact and the fix applied.

### 6.1 Cross-request tenant identity leak — security

**Root cause.** `tenantApiSignatureResult` was a single closure variable in
`app.ts`, written by the Koa signature middleware and read later by the Apollo
context factory. Between those two points the request yields, so with more than one
request in flight the variable holds whichever tenant authenticated most recently.

**Impact.** Request A's tenant could be observed while serving request B — a
cross-tenant data leak, triggered by ordinary concurrency rather than anything
adversarial. Worst of the set, and the reason this batch was done first.

**Fix.** The resolved tenant now lives on the per-request Koa context
(`ctx.tenantApiSignatureResult`, added to `AppContextData`); the Apollo context
factory takes `{ ctx }` and reads it from there. Both the production and the test
middleware were updated. The factory throws if the tenant is absent, so a future
middleware reordering fails closed instead of silently serving a tenantless context.

### 6.2 One failure rolled back an entire batch

**Root cause.** The outgoing worker wraps a whole claimed batch in one
`knex.transaction` and fans out with `Promise.all`. Any throw escaping
`handlePaymentLifecycle` rejected the `Promise.all`. The incoming worker was worse:
an uncapped `Promise.all` with no `try/catch` anywhere.

**Impact.** One bad payment rolled back **all N** siblings' state transitions and
webhook events. Accounting happens outside the transaction, so money may already
have moved; recovery is amount-safe via `getTotalSent`, but the blast radius scaled
with batch size. Latent today only because the batch size defaults to 1 — it would
have appeared the moment batching was switched on.

**Fix.** Per-item `try/catch` in both workers: a failing payment is logged with its
id and skipped, and its siblings still commit. The incoming worker also gained
bounded concurrency (`INCOMING_PAYMENT_WORKER_CONCURRENCY`, default 10) to match the
outgoing worker, so a large batch cannot fan out one pool checkout per payment.

**Known residual — deliberately not fixed here.** If the failure was a _database_
error, Postgres has already marked the transaction aborted, so the siblings'
remaining statements fail too and the batch still rolls back. Fixing that requires
each payment to run in its own transaction, which the current claim design forbids:
rows are claimed with `SELECT … FOR UPDATE SKIP LOCKED` and the locks must be held
for the batch's lifetime, so a second transaction writing to those rows would block
on the first and self-deadlock. Doing it properly means claiming by _marking_ rows
rather than locking them — a worker restructure, scheduled in Phase 4. The fix
applied here covers the common non-database failures (ILP, HTTP, accounting).

### 6.3 Non-atomic Redis pending counter

**Root cause.** `EXISTS` followed by `INCR`/`DECR` as two separate commands.

**Impact.** If the 60 s TTL expired between them, `INCR` _recreated_ the key with
value 1 and — because `INCR` sets no expiry — no TTL at all. The counter then never
expired, never resynced from the database, and reported a value near zero forever,
silently disabling `OUTGOING_PAYMENT_MAX_QUEUE_SIZE` backpressure. `DECR` on the same
race left a permanent negative.

**Fix.** A Lua script performs the existence check and the update as one atomic
step, so the key is either adjusted or left absent for the next
`isOverQueueThreshold()` miss to rebuild. `INCRBY` on an existing key preserves its
remaining TTL, so the 60 s refresh cycle is unchanged. Failures are logged and
swallowed — the counter is a cache in front of a `COUNT(*)` and must never fail
payment creation.

### 6.4 Webhook poison pill

**Root cause.** In `sendWebhook`, non-Axios errors were logged and rethrown without
touching `attempts` or `processAt`.

**Impact.** The row kept a due `processAt` and an unchanged attempt count, so
`webhookMaxRetry` could never retire it: it was re-claimed on every poll forever.
With the `ORDER BY processAt ASC` claim ordering it also sat at the head of every
batch, starving newer webhooks behind it. A single malformed encrypted payload —
which throws here rather than through Axios — was enough to trigger it.

**Fix.** Non-Axios failures now count as an attempt and set the same backoff
`processAt` as the Axios path, so the row retires normally through
`webhookMaxRetry`. The error is still rethrown so the caller logs it as unexpected.

### 6.5 Unbounded webhook fan-out and per-webhook settings lookup

**Root cause.** Batch size _was_ the delivery concurrency — no cap, unlike the
outgoing worker's chunking. Separately, `tenantSettingService.get` was called once
per webhook, uncached, against the shared pool rather than the transaction's
connection.

**Impact.** A batch of 250 opened 250 sockets at once and issued 250 concurrent pool
checkouts against `DATABASE_POOL_MAX` (20), competing with API traffic; the claim
transaction stayed open until the slowest delivery returned.

**Fix.** Deliveries run in bounded chunks (`WEBHOOK_WORKER_CONCURRENCY`, default 10).
Tenant settings are resolved once per _distinct_ recipient tenant before the fan-out,
so a batch costs one lookup per tenant rather than one per webhook; webhooks routed
to the card or POS service skip the lookup entirely.

### 6.6 Missing claim ordering on outgoing payments

**Root cause / impact.** The outgoing claim query had no `ORDER BY`, so under a
sustained backlog the rows returned were whatever the index scan yielded and a
payment could be passed over indefinitely.

**Fix.** `ORDER BY "updatedAt" ASC`, matching the webhook worker's oldest-first
ordering and letting the partial index `(updatedAt) WHERE state = 'SENDING'` drive
the scan.

---

## 7. Sizing the targets

Derived from the 20-VU run on the warm stack (17.2 payments/s), subtracting measured
idle to isolate marginal cost. Treat as **order-of-magnitude**, not precision — the
load generator shares the host.

| Resource                | CPU per payment | At 250/s     | At 1,000/s   |
| ----------------------- | --------------- | ------------ | ------------ |
| Sender backend (Node)   | 40.0 ms         | **10 cores** | **40 cores** |
| Receiver backend (Node) | 52.5 ms         | 13 cores     | 53 cores     |
| Postgres                | 19.3 ms         | ~5 cores     | **19 cores** |
| TigerBeetle             | ~0              | negligible   | negligible   |

Three consequences:

1. **250/s on this machine needs per-payment cost to come down.** At today's
   efficiency it would want ~10 sender cores; this host does not have that to spare
   once the receiver node, Postgres and k6 are also resident. So the local target is
   reached mainly by making each payment cheaper (Phase 2/3), with role-specialised
   processes (Phase 4) using the cores that remain more effectively.
2. **1,000/s on 3 nodes is the same arithmetic with more hardware**, plus Cloud SQL
   removing Postgres from the contended host. The receiver side is a different
   organisation in production; it only lands on you in closed-loop tests, so the
   real per-node requirement is the sender column.
3. **TigerBeetle is a non-issue** (2–3% utilisation, built for batches of thousands),
   and **Postgres is a query-count problem, not a CPU problem** — Phase 1 cut ~26
   queries per payment to ~18; at 1,000/s that is still ~18,000 queries/second.

**These are ingestion-side numbers, and they are no longer the whole story.** They
were derived from CPU measured while the API was accepting payments, so they size
ceiling 1. Ceiling 2 — the send worker — is not a CPU-capacity question at all: the
node is nowhere near saturated during the drain phase, and throughput there is
limited by a single worker loop with batch size 1. Adding cores does not help it;
adding worker processes and letting a batch actually be a batch does.

Put differently: the table says 250/s **ingestion** needs ~10 sender cores. Reaching
250/s **sustained** additionally needs the send path to go from ~7–23/s to 250/s,
which is a concurrency and process-topology problem, not a core-count one.

### The concurrency floor, and why the SLO tightens it

Little's Law: sustaining λ payments/s at latency W requires `L = λW` in flight.

| Target  | Latency                | Required in flight |
| ------- | ---------------------- | ------------------ |
| 250/s   | 360 ms (today)         | 90                 |
| 250/s   | 120 ms (post-Phase-2)  | 30                 |
| 1,000/s | 120 ms, across 3 nodes | ~40 per node       |

**Today the system degrades past ~5 in flight**, and the 500 ms per-call SLO caps it
there independently: at 20 VUs `createQuote` is already 804 ms. So concurrency is
the binding blocker, and cutting `createQuote` latency helps twice — it lowers the
required in-flight count _and_ buys SLO headroom to run at higher concurrency.

This is also why async ingestion being unavailable hurts: it was the mechanism that
would have let a burst queue instead of collapse. Without it, the system must
actually hold the concurrency, which puts more weight on Phase 4.

### What has to become true

| Lever                     | Today                      | Needs to be                       | Phase  |
| ------------------------- | -------------------------- | --------------------------------- | ------ |
| **Send worker capacity**  | **~7/s peer, ~23/s local** | **≥ 250/s**                       | **2a** |
| Send workers × batch size | 1 × 1                      | **N × meaningful batch**          | 2a     |
| `createQuote` latency     | ~288 ms                    | **well under 500 ms SLO at load** | 2b     |
| Postgres queries/payment  | ~18 (was ~26)              | **< 8**                           | 2b / 3 |
| Sender CPU/payment        | ~40 ms                     | **~10 ms**                        | 2b / 3 |
| Concurrent in flight      | degrades at 5 (peer)       | **100+**                          | 2b / 4 |
| Processes doing the work  | 1                          | **N, role-specialised**           | 4      |
| TigerBeetle transfers     | 1 per request              | **batched internally**            | 3      |

### Realistic assessment

Both targets remain reasonable — the ledger is idle, the database has per-query
headroom, and nothing in the design is fundamentally hostile. But two things have
made the programme longer than first estimated: the API constraint removed the
biggest single lever, and the send worker turned out to be a second ceiling that the
old harness could not see.

- **Phase 0 + 1 + 1.5** — done. Trustworthy measurement, waste removed, correctness
  bugs fixed.
- **Phase 2a** (send worker) — now first. Until it moves, nothing else changes
  sustained throughput. Also the least explored area, so the least certain estimate.
- **Phase 2b** (`createQuote`) — bounded at 6–8× for peer ingestion by §3.6, and it
  buys the SLO headroom needed to run at higher concurrency.
- **Phase 3** — internal-only efficiency behind an unchanged API. Smaller than the
  original bulk/async plan; TigerBeetle micro-batching is the standout item.
- **Phase 4** — role-specialised processes; how the remaining gap is closed once
  per-payment cost is down.

**Honest risks, in order:**

1. **The send worker is the least understood part of the system.** We know it clears
   ~7/s (peer) and ~23/s (local) and that it runs single-threaded with batch size 1,
   but we have not profiled _why_. If its cost is dominated by the same ILP send path
   that makes peer ingestion slow, then 2a and 2b are the same fix and the estimate
   improves; if not, 2a is its own body of work.
2. **`sustained/s` is a lower bound from a drain measurement**, not a steady-state
   one (§2). The real numbers could be somewhat better. Replace the metric before
   quoting capacity outside the team.
3. **The split between pacer waiting and real CPU inside the probe is still
   unmeasured.** §3.6 bounds the total ILP cost but not that split, so Phase 2b's
   contribution to _throughput_ (as opposed to latency) remains the softest number
   in this plan.

---

## Appendix — reproducing and extending

```bash
# Node 24 required; default shell node (v22) fails pnpm's engines check
source ~/.nvm/nvm.sh && nvm use 24.18.0

pnpm localenv:compose up -d

# smoke test: does the harness and the code run at all? (~30s, not a measurement)
./test/performance/bench.sh quick

# full matrix sweep (topology x strategy x VUs) with reset + warmup + settle,
# writes test/performance/results/<label>.json
./test/performance/bench.sh mylabel --reset

# narrow the matrix and repeat for confidence intervals
TOPOLOGIES=local STRATEGIES=fan-in VU_LEVELS=40 REPEATS=3 \
  ./test/performance/bench.sh mylabel

# diff two result sets (matched on topology/strategy/VUs)
python3 test/performance/compare.py \
  test/performance/results/baseline.json \
  test/performance/results/phase1.json
```

**Knobs:** `TOPOLOGIES`, `STRATEGIES`, `VU_LEVELS`, `DURATION`, `REPEATS`,
`SETTLE_TIMEOUT_S`, `SLO_WARN_MS`, `SLO_FAIL_MS`, `COMPLETION_WARN_PCT`,
`COMPLETION_FAIL_PCT`.

**Read `sustained_per_sec`, not `payments_per_sec`.** The first is what the system
clears; the second is only what the API accepted (§1).

**Development loop.** `localenv` bind-mounts `packages/backend/src` and runs
`ts-node-dev --respawn`, so **source edits go live with no Docker rebuild**. This
makes A/B measurement fast — `git stash` → measure → `git stash pop` → measure. It
also means an edit made _during_ a benchmark silently invalidates it. Rebuild images
only when dependencies or Dockerfiles change.

**Gotcha.** The k6 container cannot read scripts from a path it lacks traversal
permission on — keep test scripts under `test/performance/scripts/`.
