# Rafiki Outgoing Payment Performance — Status & Plan

**Last updated:** 2026-07-30
**Working branch:** `stephan-performance` (off `nl/batch-workers` @ `4f9ba6a7`) — Phase 0 + 1 complete, uncommitted
**Target:** 1,000 outgoing payments/second **sustained throughput**
**Environment:** single dev host; both Rafiki nodes, Postgres, TigerBeetle and k6 all co-resident and competing for the same cores

---

## 1. Where we are

|                          |                                                                             |
| ------------------------ | --------------------------------------------------------------------------- |
| Throughput today         | **~11 payments/s** at peak concurrency (5 VUs), fresh-reset stack           |
| Target                   | 1,000/s                                                                     |
| Gap                      | **~90×**                                                                    |
| Binding constraint       | Per-payment **CPU** in a single-threaded Node process                       |
| Not the constraint       | TigerBeetle (~3% utilisation), Postgres CPU (~55%, has headroom)            |
| Biggest **latency** cost | `createQuote` — **80% of creation latency**, dominated by an ILP rate probe |

Phase 0 (trustworthy measurement) and Phase 1 (remove waste) are done and verified.
They bought **+9.4% throughput** and **−54% to −89% database work per payment**.
The remaining ~90× has to come from Phases 2–4, which are architectural, not tuning.

**Latency share is not CPU share — keep these separate.** The binding constraint on
throughput is CPU. `createQuote`'s 80% is a share of _wall-clock latency_, and a
large part of it is the backend **waiting** on the ILP pacer's ~25 ms inter-packet
delays, not burning event-loop time. Waiting does not consume CPU. So `createQuote`
being 80% of the clock does **not** establish that it is 80% of the CPU cost per
payment — the probe does drag real CPU with it (packet encode/decode, per-packet
HMACs, and until Phase 1 ~11 peer lookups), but the split between waiting and
working has not been measured. This is why Phase 2 starts by instrumenting the probe
rather than assuming the headline number transfers to throughput.

**The one-line version:** we are not bound by the ledger or the database. We are
bound by per-payment CPU in a single-threaded Node process, and by a synchronous
four-round-trip creation API whose dominant _latency_ cost is an ILP rate probe that
re-derives static peer configuration on every single payment.

### A caveat that governs every number in this document

A **fresh-reset** stack measures ~11 payments/s where a **warm long-lived** stack
measured ~19/s. Both are legitimate; they are different environments. Every
before/after pair below was captured in the same environment, back to back. Never
compare a number from one table against a number in another.

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

| File                                                  | Purpose                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `test/performance/scripts/outgoing-payments-bench.js` | Pinned benchmark. Per-mutation request tags; `constant-vus` and `ramping-arrival-rate` scenarios; machine-readable `BENCH_JSON_BEGIN/END` summary. |
| `test/performance/bench.sh`                           | Runner: optional `--reset`, idle-load measurement, discarded warmup, VU sweep (1/5/20), container CPU sampling, database transactions per payment. |
| `test/performance/compare.py`                         | Diffs two result files — throughput, work per payment, per-mutation latency, CPU.                                                                  |
| `test/performance/repeat-vus5.sh`                     | N repeats at peak concurrency for confidence intervals.                                                                                            |

```bash
./test/performance/bench.sh baseline --reset
./test/performance/bench.sh phase1  --reset
python3 test/performance/compare.py test/performance/results/{baseline,phase1}.json
```

### Rules the harness enforces, and why

- **Warm up and discard.** Without it, database transactions per payment fell
  64 → 34 → 30 across three successive runs — the system was still warming while
  being measured.
- **`--reset` before each compared set.** Payment tables grow monotonically; a
  later run on a bigger table is not a fair comparison.
- **Measure work, not just speed.** Throughput alone cannot distinguish "more
  efficient" from "given more CPU". Database transactions per payment and CPU are
  what must fall for the system to scale.
- **Measure idle load.** Transactions/sec with no load applied exposes background
  waste that hides inside CPU percentages. This is what caught the busy loop.
- **Repeat before believing a sub-20% delta.** A single 45 s run cannot resolve it.
  Take 3 and check the distributions do not overlap.

### Still outstanding from Phase 0

- Move the load generator **off** the system under test. k6 currently competes with
  both nodes and Postgres for cores, which compresses every number.
- Report throughput **at a latency SLO** ("payments/s at p95 < 500 ms") rather than
  raw payments/s.
- Note that `process_pending_payment_ms` telemetry now times a whole batch rather
  than one payment, so dashboards are not comparable across the `nl/batch-workers`
  boundary.

---

## 3. What we know about the system

### 3.1 It collapses at 5 concurrent requests

Warm long-lived stack, 45 s runs:

| VUs   | payments/s | iteration p50 | failures |
| ----- | ---------- | ------------- | -------- |
| 1     | 7.5        | 131 ms        | 0        |
| **5** | **18.9**   | 254 ms        | 0        |
| 20    | 17.6       | 1.13 s        | 0        |
| 50    | 14.3       | 3.46 s        | 0        |

Past ~5 concurrent, throughput **falls** while latency grows super-linearly, with
**zero errors**. That is pure queueing — a serialised resource, not failures.

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

Batching was also aimed at the wrong layer: it batches _background workers_, but the
ceiling is in the _synchronous ingestion path_, which falls over at 5 concurrent
requests.

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

Sequencing matters more than any individual item here. **Do not start with Phase 4.**
Throwing replicas at the current code multiplies a ~18-query-per-payment workload
across more processes and hits the Postgres wall almost immediately.

### Phase 2 — Make `createQuote` cheap _(next up)_

**Why now:** it is 80% of creation latency — the single largest remaining cost on
the clock, and nothing else in the creation path is close.

**But size the prize before chasing it.** Latency share is not CPU share (§3.3), and
throughput is CPU-bound. Some of the 288 ms is the backend idling on pacer timers,
which frees no CPU when removed. Step 1 below exists to establish how much of this
converts into throughput before the rest of the phase is committed to. If the probe
turns out to be mostly waiting, its removal still raises per-VU throughput and cuts
latency sharply — but the honest expectation for peak throughput should be revised
down, and Phase 3 becomes the load-bearing work sooner.

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

### Phase 3 — Change the shape of ingestion _(where the order of magnitude comes from)_

**Why:** even with a perfect `createQuote`, the synchronous four-round-trip API
fights a throughput target structurally. Each payment pays four signature
verifications, ~11 Redis round trips of bookkeeping, four separate transactions, and
one TigerBeetle transfer per request against a ledger designed for batches of
thousands.

**Approach, in escalating order of payoff and disruption:**

1. **Composite mutation** — one call performing receiver + quote + payment + funding.
   Removes 3 network round trips, 3 signature verifications and ~6 Redis round trips
   per payment. Purely additive: existing mutations keep working, so it is the safe
   first step.
2. **Bulk mutation** — accept N payments per request: one transaction, bulk insert,
   and critically **batched TigerBeetle transfers**. This is the largest structural
   win available on the write path and turns the idle ledger into free throughput.
3. **Asynchronous ingestion** — accept, persist, return `202` with a handle, and let
   workers quote and fund. This decouples ingestion rate from processing rate, so a
   burst above capacity queues instead of collapsing. It is what makes the target
   reachable; the synchronous model has a hard latency floor no tuning removes.

**Watch out for:** this changes the public API, so it needs design buy-in beyond the
performance work. Async ingestion also changes the client contract — callers must
handle a handle-and-poll or webhook flow instead of a synchronous result. Bulk
endpoints need a defined partial-failure semantic (all-or-nothing versus per-item
results); decide that before implementing, not after.

**Exit criteria:** ingestion throughput no longer scales with per-payment network
latency.

### Phase 4 — Scale out, and make batching real

**Only after Phase 2, and only safe after the batch bugs in §6 are fixed.**

**Approach:**

1. **Fix the batch implementation before enabling it** — per-item error isolation
   (§6.1), one transaction per payment or per small chunk rather than one per batch,
   bounded webhook fan-out, batched tenant-settings lookup, atomic Redis counters
   (§6.2).
2. **Then** set the batch-size env vars, and add them to compose files and charts so
   the feature is actually exercised rather than shipped inert.
3. **Run multiple backend processes.** One single-threaded Node process pegged at a
   core, while Postgres has headroom and TigerBeetle is idle, is the most direct
   multiplier available.
4. **Raise `DATABASE_POOL_MAX`** (currently 20, shared by the APIs, every worker and
   Postgres-mode accounting) in step with process count.
5. **Remove the single-shared-transaction design** in the workers so in-transaction
   writes stop serialising on one connection.

**Note on what batch size actually buys:** throughput ≈
`workers × min(concurrency / T_pay, 1 / D)`. Batch size does not appear —
**concurrency and worker count are the levers**. Batch size only amortises the claim
query and the commit. This is the arithmetic reason the batching branch showed
mixed results.

**Exit criteria:** throughput scales roughly linearly with backend process count.

---

## 6. Known bugs not yet fixed

Independent of the performance work; each deserves its own ticket.

### 6.1 One failure rolls back an entire outgoing/incoming batch

The outgoing worker wraps a whole batch in one `knex.transaction` and fans out with
`Promise.all`. Any throw escaping `handlePaymentLifecycle` rejects the `Promise.all`,
rolls back **all N** payments' state transitions and webhook events, and — because
Postgres marks the transaction aborted — makes every sibling's remaining queries
fail with `current transaction is aborted`. One bad payment poisons the batch.
Accounting happens outside the transaction so money may already have moved; recovery
is amount-safe via `getTotalSent`, but blast radius scales with batch size.

The webhook path already solved this with a per-item `try/catch`; outgoing and
incoming did not get the same treatment. Incoming additionally has **no concurrency
cap** — safe today only because its batch size defaults to 1.

### 6.2 Redis pending-counter is not atomic

```ts
const exists = await deps.redis.exists(cacheKey)
if (exists) {
  await deps.redis.incr(cacheKey)
}
```

TOCTOU. If the 60 s TTL expires between the two commands, `INCR` recreates the key
**with no TTL**. The counter then never expires, never resyncs from the database, and
reports a near-zero value — so `OUTGOING_PAYMENT_MAX_QUEUE_SIZE` backpressure
silently stops working. `DECR` on the same race can leave a permanent negative.
_Fix:_ a Lua script, or `SET NX` + `INCR`/`EXPIRE` in a `MULTI`.

### 6.3 Cross-request race on tenant identity — security-relevant

`tenantApiSignatureResult` is a single closure variable written by the Koa signature
middleware and read later by the Apollo context factory. Under concurrency, request
A's tenant can be observed by request B. This is a correctness and security issue,
not a performance one, and should be prioritised independently.

### 6.4 Smaller items

- **Webhook poison pill.** Non-Axios failures neither increment `attempts` nor
  advance `processAt`, so `webhookMaxRetry` never retires the row. Combined with the
  new `ORDER BY processAt ASC`, it sits at the head of every batch forever.
- **Unbounded webhook fan-out.** Batch size _is_ the delivery concurrency — no cap,
  unlike the outgoing worker's chunking. The transaction stays open across all HTTP
  deliveries, so commit rate is gated by the slowest delivery.
- **Uncached tenant-settings lookup per webhook**, issued against the pool rather
  than the transaction: N concurrent checkouts against `DATABASE_POOL_MAX=20`.
- **No `orderBy` on the outgoing claim query**, so under backlog, ordering is
  whatever the index scan yields.

---

## 7. Sizing the 1,000 TPS target

Derived from the 20-VU run on the warm stack (17.2 payments/s), subtracting measured
idle to isolate marginal cost. Treat as **order-of-magnitude**, not precision — the
load generator shares the host.

| Resource                | CPU per payment | At 1,000 TPS |
| ----------------------- | --------------- | ------------ |
| Sender backend (Node)   | 40.0 ms         | **40 cores** |
| Receiver backend (Node) | 52.5 ms         | 53 cores     |
| Postgres                | 19.3 ms         | **19 cores** |
| TigerBeetle             | ~0              | negligible   |

Three consequences:

1. **1,000 TPS at today's efficiency needs ~40 sender-side backend cores plus ~19
   Postgres cores.** Large but not absurd — a real target. (The receiver side is a
   different organisation in production; it only lands on you in closed-loop tests.)
2. **TigerBeetle is a non-issue.** 2–3% utilisation, and built for batches of
   thousands.
3. **Postgres is a query-count problem, not a CPU problem.** Phase 1 cut ~26 queries
   per payment to ~18; at 1,000 TPS that is still ~18,000 queries/second against a
   single primary handling transactional writes.

### The concurrency floor

Little's Law: at 1,000 TPS with ~360 ms per-payment latency you must hold
`L = λW ≈ 360` payments in flight. **The system currently degrades past 5.** Even at
a Phase-2-improved 120 ms, the floor is ~120 concurrent. This is the hard blocker,
and it is why Phase 3's async ingestion is mandatory rather than optional.

### What has to become true

| Lever                    | Today         | Needs to be     | Phase |
| ------------------------ | ------------- | --------------- | ----- |
| Postgres queries/payment | ~18 (was ~26) | **< 8**         | 2     |
| Sender CPU/payment       | ~40 ms        | **~10 ms**      | 2     |
| Concurrent in flight     | degrades at 5 | **150+**        | 3     |
| Backend processes        | 1             | **N (cluster)** | 4     |
| TigerBeetle transfers    | 1 per request | **batched**     | 3     |

### Realistic assessment

1,000 TPS is reasonable for this architecture — the ledger is idle, the database has
per-query headroom, and nothing in the design is fundamentally hostile to it. But it
is **a programme of work, not a sprint**:

- **Phase 0 + 1** — done. Groundwork: trustworthy measurement, waste removed.
- **Phase 2** — should get to the low hundreds/s on a single node. Mostly
  self-contained caching work.
- **Phase 3** — where the order of magnitude comes from. Real engineering, changes
  the public API, needs design buy-in.
- **Phase 4** — converts per-node efficiency into the target. Straightforward _once_
  per-payment cost is down and the concurrency collapse is fixed.

---

## Appendix — reproducing and extending

```bash
# Node 24 required; default shell node (v22) fails pnpm's engines check
source ~/.nvm/nvm.sh && nvm use 24.18.0

pnpm localenv:compose up -d

# full sweep with reset + warmup, writes test/performance/results/<label>.json
./test/performance/bench.sh mylabel --reset

# confidence check at peak concurrency
./test/performance/repeat-vus5.sh mylabel 3

# diff two result sets
python3 test/performance/compare.py \
  test/performance/results/baseline.json \
  test/performance/results/phase1.json
```

**Development loop.** `localenv` bind-mounts `packages/backend/src` and runs
`ts-node-dev --respawn`, so **source edits go live with no Docker rebuild**. This
makes A/B measurement fast — `git stash` → measure → `git stash pop` → measure. It
also means an edit made _during_ a benchmark silently invalidates it. Rebuild images
only when dependencies or Dockerfiles change.

**Gotcha.** The k6 container cannot read scripts from a path it lacks traversal
permission on — keep test scripts under `test/performance/scripts/`.
