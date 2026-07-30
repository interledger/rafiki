// Outgoing-payment ingestion benchmark.
//
// One parameterised script rather than a copy per scenario — the previous copies
// drifted apart and the local-payment one silently bit-rotted against a schema
// change. Every scenario is a point in this dimension space:
//
//   TOPOLOGY  peer  | local
//             Which instance owns the receiving wallet address. `createReceiver`
//             resolves a local URL to a local incoming payment and a foreign URL
//             to a remote one, so the four-mutation flow is byte-for-byte the
//             same either way — only the receiver address changes. `local`
//             therefore selects the LOCAL payment method and bypasses the ILP
//             connector and its rate probe entirely, which makes peer-vs-local
//             a direct measurement of what ILP costs.
//
//   STRATEGY  many-to-many | fan-in | fan-out
//             How senders and receivers are paired, which is what decides
//             database and ledger lock contention:
//               many-to-many  unique sender AND unique receiver per VU.
//                             The low-contention baseline.
//               fan-in        many senders -> ONE receiver. Contends on the
//                             receiving wallet address and its liquidity account.
//               fan-out       ONE sender -> many receivers. Contends on the
//                             sending wallet address and its liquidity account.
//             NOTE: before this restructure the benchmark always ran
//             gfranklin -> pfry, i.e. fan-in and fan-out simultaneously — the
//             maximally contended case, and the only case ever measured.
//
//   VUS       concurrent virtual users (the concurrency dimension)
//   MODE      quick | full
//             `quick` is a smoke test: 1 VU, short, fails on any error. It is
//             for "does this run at all", never for reporting numbers.
//
// SLO (see performance-improvement.md §0):
//   p95 per call >= 2000 ms  -> run FAILS (k6 threshold, non-zero exit)
//   p95 per call >=  500 ms  -> run WARNS (reported, does not fail)
//
// The summary is emitted twice: human-readable text, and a machine-readable
// block delimited by BENCH_JSON_BEGIN/END for the runner to diff across builds.

/* global __ENV, __VU */

import http from 'k6/http'
import { fail } from 'k6'
import { createHMAC } from 'k6/crypto'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
import { canonicalize } from '../dist/json-canonicalize.bundle.js'

const TOPOLOGY = __ENV.TOPOLOGY || 'peer'
const STRATEGY = __ENV.STRATEGY || 'many-to-many'
const MODE = __ENV.MODE || 'full'
const LABEL = __ENV.LABEL || 'unlabelled'

const VUS = parseInt(__ENV.VUS || (MODE === 'quick' ? '1' : '5'))
const DURATION = __ENV.DURATION || (MODE === 'quick' ? '10s' : '45s')

const SLO_FAIL_MS = parseInt(__ENV.SLO_FAIL_MS || '2000')
const SLO_WARN_MS = parseInt(__ENV.SLO_WARN_MS || '500')

const VALID_TOPOLOGIES = ['peer', 'local']
const VALID_STRATEGIES = ['many-to-many', 'fan-in', 'fan-out']
if (!VALID_TOPOLOGIES.includes(TOPOLOGY)) {
  fail(`TOPOLOGY must be one of ${VALID_TOPOLOGIES.join(' | ')}`)
}
if (!VALID_STRATEGIES.includes(STRATEGY)) {
  fail(`STRATEGY must be one of ${VALID_STRATEGIES.join(' | ')}`)
}

const MUTATIONS = [
  '1-createReceiver',
  '2-createQuote',
  '3-createOutgoingPayment',
  '4-depositLiquidity'
]

// Declaring a threshold per tagged sub-metric is also what makes k6 emit that
// sub-metric in handleSummary, so this doubles as the SLO gate and as the
// mechanism for the per-mutation breakdown.
const thresholds = {}
for (const name of MUTATIONS) {
  thresholds[`http_req_duration{name:${name}}`] = [`p(95)<${SLO_FAIL_MS}`]
}
// A smoke run is only meaningful if nothing errored.
if (MODE === 'quick') {
  thresholds['http_req_failed'] = ['rate==0']
}

export const options = {
  scenarios: {
    [`${TOPOLOGY}_${STRATEGY.replace(/-/g, '_')}`]: {
      executor: 'constant-vus',
      vus: VUS,
      duration: DURATION
    }
  },
  thresholds,
  // Report the breach; don't abort mid-run, we still want the numbers.
  noConnectionReuse: false
}

// --- endpoints -------------------------------------------------------------

const SENDER_GQL = __ENV.SENDER_GQL_ENDPOINT || __ENV.CLOUD_NINE_GQL_ENDPOINT
const SENDER_TENANT_ID =
  __ENV.SENDER_TENANT_ID || '438fa74a-fa7d-4317-9ced-dde32ece1787'
const SENDER_PREFIX =
  __ENV.SENDER_ADDRESS_PREFIX || 'https://cloud-nine-wallet-backend/accounts'

// For TOPOLOGY=local the receiver lives on the sending instance, so both sides
// address the same admin API and the same tenant.
const RECEIVER_GQL =
  TOPOLOGY === 'local'
    ? SENDER_GQL
    : __ENV.RECEIVER_GQL_ENDPOINT || __ENV.HAPPY_LIFE_GQL_ENDPOINT
const RECEIVER_TENANT_ID =
  TOPOLOGY === 'local'
    ? SENDER_TENANT_ID
    : __ENV.RECEIVER_TENANT_ID || 'cf5fd7d3-1eb1-4041-8e43-ba45747e9e5d'
const RECEIVER_PREFIX =
  TOPOLOGY === 'local'
    ? SENDER_PREFIX
    : __ENV.RECEIVER_ADDRESS_PREFIX ||
      'https://happy-life-bank-backend/accounts'

const SIGNATURE_SECRET =
  __ENV.SIGNATURE_SECRET || 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964='
const SIGNATURE_VERSION = '1'

const ASSET_CODE = __ENV.ASSET_CODE || 'USD'
const ASSET_SCALE = parseInt(__ENV.ASSET_SCALE || '2')

// --- transport -------------------------------------------------------------

function signedHeaders(payload, tenantId) {
  const timestamp = Date.now()
  const body = `${timestamp}.${canonicalize(payload)}`
  const hmac = createHMAC('sha256', SIGNATURE_SECRET)
  hmac.update(body)

  return {
    'Content-Type': 'application/json',
    signature: `t=${timestamp}, v${SIGNATURE_VERSION}=${hmac.digest('hex')}, n=${uuidv4()}`,
    'tenant-id': tenantId
  }
}

function gql(endpoint, tenantId, query, tag) {
  const response = http.post(endpoint, JSON.stringify(query), {
    headers: signedHeaders(query, tenantId),
    tags: tag ? { name: tag } : undefined
  })

  if (response.status !== 200) {
    fail(`GraphQL request failed (${tag || 'setup'}): HTTP ${response.status}`)
  }
  const body = JSON.parse(response.body)
  if (body.errors) {
    fail(`GraphQL error (${tag || 'setup'}): ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

// --- setup: build the wallet address pools ---------------------------------

function listWalletAddresses(endpoint, tenantId) {
  const data = gql(endpoint, tenantId, {
    query: `query { walletAddresses(first: 100) { edges { node { id address } } } }`
  })
  return data.walletAddresses.edges.map((edge) => edge.node)
}

function findAssetId(endpoint, tenantId) {
  const data = gql(endpoint, tenantId, {
    query: `query { assets(first: 100) { edges { node { id code scale } } } }`
  })
  const asset = data.assets.edges
    .map((edge) => edge.node)
    .find((node) => node.code === ASSET_CODE && node.scale === ASSET_SCALE)
  if (!asset) {
    fail(`no ${ASSET_CODE}/${ASSET_SCALE} asset on ${endpoint}`)
  }
  return asset.id
}

function createWalletAddress(endpoint, tenantId, assetId, address) {
  const data = gql(endpoint, tenantId, {
    query: `
      mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
        createWalletAddress(input: $input) { walletAddress { id address } }
      }
    `,
    variables: {
      input: { assetId, address, publicName: address.split('/').pop() }
    }
  })
  return data.createWalletAddress.walletAddress
}

// Return `count` wallet addresses on the given instance, creating dedicated
// perf-* addresses when the seed does not supply enough. Reusing a stable
// naming scheme means repeated runs against a non-reset stack reuse the same
// addresses instead of growing the table without bound.
function ensurePool(endpoint, tenantId, prefix, role, count) {
  const existing = listWalletAddresses(endpoint, tenantId)
  const byAddress = new Map(existing.map((wa) => [wa.address, wa]))

  const pool = []
  let assetId = null
  for (let i = 0; i < count; i++) {
    const address = `${prefix}/perf-${role}-${i}`
    let walletAddress = byAddress.get(address)
    if (!walletAddress) {
      if (assetId === null) assetId = findAssetId(endpoint, tenantId)
      walletAddress = createWalletAddress(endpoint, tenantId, assetId, address)
    }
    pool.push(walletAddress)
  }
  return pool
}

// How many distinct senders and receivers the strategy needs. The pool is sized
// to the VU count so that "unique per VU" is actually unique.
function poolSizes(vus) {
  switch (STRATEGY) {
    case 'fan-in':
      return { senders: vus, receivers: 1 }
    case 'fan-out':
      return { senders: 1, receivers: vus }
    default:
      return { senders: vus, receivers: vus }
  }
}

export function setup() {
  if (!SENDER_GQL)
    fail('SENDER_GQL_ENDPOINT (or CLOUD_NINE_GQL_ENDPOINT) is required')
  if (!RECEIVER_GQL)
    fail('RECEIVER_GQL_ENDPOINT (or HAPPY_LIFE_GQL_ENDPOINT) is required')

  const sizes = poolSizes(VUS)
  const senders = ensurePool(
    SENDER_GQL,
    SENDER_TENANT_ID,
    SENDER_PREFIX,
    'snd',
    sizes.senders
  )
  const receivers = ensurePool(
    RECEIVER_GQL,
    RECEIVER_TENANT_ID,
    RECEIVER_PREFIX,
    'rcv',
    sizes.receivers
  )

  return { senders, receivers }
}

// --- the measured flow -----------------------------------------------------

export default function (data) {
  const { senders, receivers } = data
  // __VU is 1-based. Each VU sticks to one pairing for the whole run, so a
  // fan-in run really does drive every payment at one receiver.
  const sender = senders[(__VU - 1) % senders.length]
  const receiver = receivers[(__VU - 1) % receivers.length]

  const created = gql(
    SENDER_GQL,
    SENDER_TENANT_ID,
    {
      query: `
      mutation CreateReceiver($input: CreateReceiverInput!) {
        createReceiver(input: $input) { receiver { id } }
      }
    `,
      variables: {
        input: {
          expiresAt: null,
          metadata: { description: 'perf', externalRef: null },
          incomingAmount: {
            assetCode: ASSET_CODE,
            assetScale: ASSET_SCALE,
            value: 1002
          },
          walletAddressUrl: receiver.address
        }
      }
    },
    '1-createReceiver'
  ).createReceiver.receiver

  const quote = gql(
    SENDER_GQL,
    SENDER_TENANT_ID,
    {
      query: `
      mutation CreateQuote($input: CreateQuoteInput!) {
        createQuote(input: $input) { quote { id } }
      }
    `,
      variables: {
        input: {
          walletAddressId: sender.id,
          receiveAmount: null,
          receiver: created.id,
          debitAmount: {
            assetCode: ASSET_CODE,
            assetScale: ASSET_SCALE,
            value: 500
          }
        }
      }
    },
    '2-createQuote'
  ).createQuote.quote

  const payment = gql(
    SENDER_GQL,
    SENDER_TENANT_ID,
    {
      query: `
      mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
        createOutgoingPayment(input: $input) { payment { id } }
      }
    `,
      variables: { input: { walletAddressId: sender.id, quoteId: quote.id } }
    },
    '3-createOutgoingPayment'
  ).createOutgoingPayment.payment

  gql(
    SENDER_GQL,
    SENDER_TENANT_ID,
    {
      query: `
      mutation DepositOutgoingPaymentLiquidity($input: DepositOutgoingPaymentLiquidityInput!) {
        depositOutgoingPaymentLiquidity(input: $input) { success }
      }
    `,
      variables: {
        input: { outgoingPaymentId: payment.id, idempotencyKey: uuidv4() }
      }
    },
    '4-depositLiquidity'
  )
}

// --- reporting -------------------------------------------------------------

function trend(metric) {
  if (!metric || !metric.values) return null
  const v = metric.values
  return {
    avg: +v.avg.toFixed(2),
    med: +v.med.toFixed(2),
    p95: +v['p(95)'].toFixed(2)
  }
}

export function handleSummary(data) {
  const m = data.metrics
  const perMutation = {}
  const warnings = []
  const breaches = []

  for (const name of MUTATIONS) {
    const t = trend(m[`http_req_duration{name:${name}}`])
    perMutation[name] = t
    if (!t) continue
    if (t.p95 >= SLO_FAIL_MS) {
      breaches.push(`${name} p95 ${t.p95}ms >= ${SLO_FAIL_MS}ms`)
    } else if (t.p95 >= SLO_WARN_MS) {
      warnings.push(`${name} p95 ${t.p95}ms >= ${SLO_WARN_MS}ms`)
    }
  }

  const payments = m.iterations.values.count
  const result = {
    label: LABEL,
    dimensions: {
      topology: TOPOLOGY,
      strategy: STRATEGY,
      vus: VUS,
      duration: DURATION,
      mode: MODE,
      asset: `${ASSET_CODE}/${ASSET_SCALE}`
    },
    throughput: {
      payments_per_sec: +m.iterations.values.rate.toFixed(2),
      payments_total: payments,
      http_reqs_per_sec: +m.http_reqs.values.rate.toFixed(2),
      reqs_per_payment: payments
        ? +(m.http_reqs.values.count / payments).toFixed(3)
        : null
    },
    latency: {
      iteration: trend(m.iteration_duration),
      http_req: trend(m.http_req_duration)
    },
    per_mutation: perMutation,
    slo: {
      warn_ms: SLO_WARN_MS,
      fail_ms: SLO_FAIL_MS,
      status: breaches.length ? 'FAIL' : warnings.length ? 'WARN' : 'OK',
      breaches,
      warnings
    },
    failures: {
      failed_req_rate: +(m.http_req_failed?.values.rate ?? 0).toFixed(4),
      failed_reqs: m.http_req_failed?.values.passes ?? 0
    }
  }

  const banner =
    `\n=== ${TOPOLOGY} / ${STRATEGY} / ${VUS} VU${VUS === 1 ? '' : 's'} ` +
    `-> ${result.throughput.payments_per_sec} payments/s [${result.slo.status}] ===\n` +
    warnings.map((w) => `  WARN: ${w}\n`).join('') +
    breaches.map((b) => `  FAIL: ${b}\n`).join('')

  return {
    stdout:
      textSummary(data, { enableColors: false }) +
      banner +
      '\nBENCH_JSON_BEGIN\n' +
      JSON.stringify(result, null, 2) +
      '\nBENCH_JSON_END\n'
  }
}
