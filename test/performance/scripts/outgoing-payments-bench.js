// Outgoing-payment ingestion benchmark.
//
// Replaces the ad-hoc `vus: 1` scripts for capacity work. Two differences that
// matter:
//
//   1. `vus: 1` measures serial latency, not throughput — the reported
//      iterations/s is arithmetically 1000/iteration_duration_ms. Use
//      SCENARIO=arrival to drive an open-model load and find the saturation
//      point; SCENARIO=vus is kept for closed-model A/B comparisons.
//   2. Every request is tagged, so per-mutation cost is visible. Thresholds are
//      declared on the tagged sub-metrics purely to force k6 to emit them in
//      the summary (`max>=0` always passes).
//
// Env:
//   SCENARIO   'vus' (default) | 'arrival'
//   VUS        constant-vus target            (SCENARIO=vus,     default 5)
//   DURATION   run length                     (SCENARIO=vus,     default 60s)
//   START_RATE / END_RATE / STAGE             (SCENARIO=arrival, default 10/200/30s)
//   LABEL      free-text label echoed into the JSON block
//
// The summary is emitted twice: human-readable text, and a machine-readable
// block delimited by BENCH_JSON_BEGIN/END for the runner to diff across builds.

/* global __ENV */

import http from 'k6/http'
import { fail } from 'k6'
import { createHMAC } from 'k6/crypto'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
import { canonicalize } from '../dist/json-canonicalize.bundle.js'

const SCENARIO = __ENV.SCENARIO || 'vus'
const LABEL = __ENV.LABEL || 'unlabelled'

const MUTATIONS = [
  '1-createReceiver',
  '2-createQuote',
  '3-createOutgoingPayment',
  '4-depositLiquidity'
]

// `max>=0` is a tautology — declaring the threshold is what makes k6 emit the
// tagged sub-metric in handleSummary. It is not a pass/fail gate.
const thresholds = {}
for (const name of MUTATIONS) {
  thresholds[`http_req_duration{name:${name}}`] = ['max>=0']
}

const scenarios = {
  vus: {
    executor: 'constant-vus',
    vus: parseInt(__ENV.VUS || '5'),
    duration: __ENV.DURATION || '60s'
  },
  arrival: {
    executor: 'ramping-arrival-rate',
    startRate: parseInt(__ENV.START_RATE || '10'),
    timeUnit: '1s',
    // Pre-allocate generously: if k6 runs out of VUs it silently throttles the
    // arrival rate and the run measures k6, not Rafiki.
    preAllocatedVUs: 50,
    maxVUs: 400,
    stages: [
      {
        target: parseInt(__ENV.START_RATE || '10'),
        duration: __ENV.STAGE || '30s'
      },
      {
        target: parseInt(__ENV.END_RATE || '200'),
        duration: __ENV.STAGE || '30s'
      }
    ]
  }
}

export const options = {
  scenarios: { [SCENARIO]: scenarios[SCENARIO] },
  thresholds,
  // Don't abort the run on a failed threshold; we want the numbers either way.
  noConnectionReuse: false
}

const CLOUD_NINE_GQL_ENDPOINT = __ENV.CLOUD_NINE_GQL_ENDPOINT
const CLOUD_NINE_WALLET_ADDRESS = __ENV.CLOUD_NINE_WALLET_ADDRESS
const CLOUD_NINE_TENANT_ID = '438fa74a-fa7d-4317-9ced-dde32ece1787'
const HAPPY_LIFE_BANK_WALLET_ADDRESS = __ENV.HAPPY_LIFE_BANK_WALLET_ADDRESS
const SIGNATURE_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964='
const SIGNATURE_VERSION = '1'

function generateSignedHeaders(requestPayload) {
  const timestamp = Date.now()
  const payload = `${timestamp}.${canonicalize(requestPayload)}`
  const hmac = createHMAC('sha256', SIGNATURE_SECRET)
  hmac.update(payload)
  const digest = hmac.digest('hex')

  return {
    'Content-Type': 'application/json',
    signature: `t=${timestamp}, v${SIGNATURE_VERSION}=${digest}, n=${uuidv4()}`,
    'tenant-id': CLOUD_NINE_TENANT_ID
  }
}

function request(query, tag) {
  const headers = generateSignedHeaders(query)
  const response = http.post(CLOUD_NINE_GQL_ENDPOINT, JSON.stringify(query), {
    headers,
    tags: { name: tag }
  })

  if (response.status !== 200) {
    fail(`GraphQL request failed (${tag}): HTTP ${response.status}`)
  }
  const body = JSON.parse(response.body)
  if (body.errors) {
    fail(`GraphQL error (${tag}): ${JSON.stringify(body.errors)}`)
  }
  return body.data
}

export function setup() {
  const data = request(
    {
      query: `
      query GetWalletAddresses {
        walletAddresses {
          edges { node { id address } }
        }
      }
    `
    },
    '0-setup'
  )

  const c9WalletAddress = data.walletAddresses.edges.find(
    (edge) => edge.node.address === CLOUD_NINE_WALLET_ADDRESS
  )?.node
  if (!c9WalletAddress) {
    fail(`could not find wallet address: ${CLOUD_NINE_WALLET_ADDRESS}`)
  }

  return { data: { c9WalletAddress } }
}

export default function (data) {
  const {
    data: { c9WalletAddress }
  } = data

  const receiver = request(
    {
      query: `
      mutation CreateReceiver($input: CreateReceiverInput!) {
        createReceiver(input: $input) { receiver { id } }
      }
    `,
      variables: {
        input: {
          expiresAt: null,
          metadata: { description: 'Hello my friend', externalRef: null },
          incomingAmount: { assetCode: 'USD', assetScale: 2, value: 1002 },
          walletAddressUrl: HAPPY_LIFE_BANK_WALLET_ADDRESS
        }
      }
    },
    '1-createReceiver'
  ).createReceiver.receiver

  const quote = request(
    {
      query: `
      mutation CreateQuote($input: CreateQuoteInput!) {
        createQuote(input: $input) { quote { id } }
      }
    `,
      variables: {
        input: {
          walletAddressId: c9WalletAddress.id,
          receiveAmount: null,
          receiver: receiver.id,
          debitAmount: { assetCode: 'USD', assetScale: 2, value: 500 }
        }
      }
    },
    '2-createQuote'
  ).createQuote.quote

  const outgoingPayment = request(
    {
      query: `
      mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
        createOutgoingPayment(input: $input) { payment { id } }
      }
    `,
      variables: {
        input: { walletAddressId: c9WalletAddress.id, quoteId: quote.id }
      }
    },
    '3-createOutgoingPayment'
  ).createOutgoingPayment.payment

  request(
    {
      query: `
      mutation DepositOutgoingPaymentLiquidity($input: DepositOutgoingPaymentLiquidityInput!) {
        depositOutgoingPaymentLiquidity(input: $input) { success }
      }
    `,
      variables: {
        input: {
          outgoingPaymentId: outgoingPayment.id,
          idempotencyKey: uuidv4()
        }
      }
    },
    '4-depositLiquidity'
  )
}

function trend(metric) {
  if (!metric || !metric.values) return null
  const v = metric.values
  return {
    count: metric.values.count !== undefined ? metric.values.count : undefined,
    avg: +v.avg.toFixed(2),
    med: +v.med.toFixed(2),
    p95: +v['p(95)'].toFixed(2)
  }
}

export function handleSummary(data) {
  const m = data.metrics
  const perMutation = {}
  for (const name of MUTATIONS) {
    perMutation[name] = trend(m[`http_req_duration{name:${name}}`])
  }

  const result = {
    label: LABEL,
    scenario: SCENARIO,
    config:
      SCENARIO === 'vus'
        ? { vus: __ENV.VUS || '5', duration: __ENV.DURATION || '60s' }
        : {
            startRate: __ENV.START_RATE || '10',
            endRate: __ENV.END_RATE || '200'
          },
    throughput: {
      // The headline number: completed payments per second.
      payments_per_sec: +m.iterations.values.rate.toFixed(2),
      payments_total: m.iterations.values.count,
      http_reqs_per_sec: +m.http_reqs.values.rate.toFixed(2),
      reqs_per_payment: +(
        m.http_reqs.values.count / m.iterations.values.count
      ).toFixed(3)
    },
    latency: {
      iteration: trend(m.iteration_duration),
      http_req: trend(m.http_req_duration)
    },
    per_mutation: perMutation,
    failures: {
      failed_req_rate: +(m.http_req_failed?.values.rate ?? 0).toFixed(4),
      failed_reqs: m.http_req_failed?.values.passes ?? 0
    }
  }

  return {
    stdout:
      textSummary(data, { enableColors: false }) +
      '\n\nBENCH_JSON_BEGIN\n' +
      JSON.stringify(result, null, 2) +
      '\nBENCH_JSON_END\n'
  }
}
