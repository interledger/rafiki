// global comment below tells ESLint that __ENV exists, else get "no-undef" error
///* global __ENV */

import http from 'k6/http'
import { fail } from 'k6'
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js'
//TODO import { canonicalize } from '../dist/json-canonicalize.bundle.js'
import { check } from 'k6'
//import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'
//import { createHMAC } from 'k6/crypto'

export const options = {
  // A number specifying the number of VUs to run concurrently.
  vus: 1,
  // A string specifying the total duration of the test run.
  duration: '1s'
}

//************ CRYPTO STUFF TO GEN SIG ************************
//TODO const SIGNATURE_SECRET = 'iyIgCprjb9uL8wFckR+pLEkJWMB7FJhgkvqhTQR/964='
//TODO const SIGNATURE_VERSION = '1'

const HTTP_SIGN_SERVER = 'http://localhost:5001/http-sign'
const HTTP_CONSENT_SERVER = 'http://localhost:5001/consent-interaction'

// Sender:
const SENDER_WALLET_ADDRESS = 'http://localhost:3000/accounts/gfranklin'
const SENDER_HOST = 'cloud-nine-wallet-backend'
const SENDER_AUTH_HOST_URL = 'http://localhost:3006'
const SENDER_BACKEND_HOST_URL = 'http://localhost:3000'

// Receiver:
const RECEIVER_WALLET_ADDRESS = 'http://localhost:4000/accounts/asmith'
const RECEIVER_HOST = 'happy-life-bank-backend'
const RECEIVER_AUTH_HOST_URL = 'http://localhost:4006'
const RECEIVER_BACKEND_HOST_URL = 'http://localhost:4000'

// Client:
const CLIENT_PRIVATE_KEY_B64 =
  'LS0tLS1CRUdJTiBQUklWQVRFIEtFWS0tLS0tCk1DNENBUUF3QlFZREsyVndCQ0lFSUVxZXptY1BoT0U4Ymt3TitqUXJwcGZSWXpHSWRGVFZXUUdUSEpJS3B6ODgKLS0tLS1FTkQgUFJJVkFURSBLRVktLS0tLQo='
const CLIENT_KEY_ID = 'keyid-97a3a431-8ee1-48fc-ac85-70e2f5eba8e5'
const CLIENT_WALLET_ADDRESS = 'https://happy-life-bank-backend/accounts/pfry'

function requestSigHeadersOpenPayments(key, keyId, url, method, headers, body) {
  headers['Content-Type'] = 'application/json'

  const response = http.post(
    HTTP_SIGN_SERVER,
    JSON.stringify({
      keyId,
      base64Key: key,
      url,
      method,
      headers,
      body
    }),
    { headers }
  )
  check(response, {
    'sign request with open-payments utils': (r) => r.status === 200
  })

  const jsonRsp = JSON.parse(response.body)
  //console.log('!!!!!!!! sign-response ----====>>>> : ' + response.body)

  return {
    'content-digest': jsonRsp.contentDigest,
    signature: jsonRsp.signature,
    'signature-input': jsonRsp.signatureInput /* + ';alg="ed25519"'*/
  }
}

//*************************************************************
function requestGet(url, host) {
  return http.get(url, {
    host: host
  })
}

function postWithSignatureHeaders(key, keyId, url, data, headers) {
  const body = JSON.stringify(data)
  const signatureHeaders = requestSigHeadersOpenPayments(
    key,
    keyId,
    url,
    'POST',
    headers,
    body
  )
  signatureHeaders['content-type'] = 'application/json'
  console.log('signature headers: ' + JSON.stringify(signatureHeaders) + '')
  return http.post(url, body, { signatureHeaders })
}

export function setup() {
  // 1. Sender:
  const responseSender = requestGet(SENDER_WALLET_ADDRESS, SENDER_HOST)
  check(responseSender, {
    'get sender wallet address': (r) => r.status === 200
  })
  const senderWalletData = JSON.parse(responseSender.body)

  // 2. Receiver:
  const responseReceiver = requestGet(RECEIVER_WALLET_ADDRESS, RECEIVER_HOST)
  check(responseReceiver, {
    'get receiver wallet address': (r) => r.status === 200
  })
  const receiverWalletData = JSON.parse(responseReceiver.body)

  if (!receiverWalletData || !senderWalletData) {
    fail(
      `could not find wallet address: ${receiverWalletData}||${senderWalletData}`
    )
  }

  const clientPrivateKeyB64 = CLIENT_PRIVATE_KEY_B64
  const keyId = CLIENT_KEY_ID
  return {
    data: { receiverWalletData, senderWalletData, clientPrivateKeyB64, keyId }
  }
}

// The function that defines VU logic.
// See https://grafana.com/docs/k6/latest/examples/get-started-with-k6/ to learn more
// about authoring k6 scripts.
//
export default function (data) {
  const {
    data: { receiverWalletData, senderWalletData, clientPrivateKeyB64, keyId }
  } = data

  console.log(
    `receiverWalletData : ${JSON.stringify(receiverWalletData, null, 2)}`
  )
  console.log(`senderWalletData : ${JSON.stringify(senderWalletData, null, 2)}`)

  // 3. Grant Request Incoming Payment:
  const rspGrantReqInPay = postWithSignatureHeaders(
    clientPrivateKeyB64,
    keyId,
    RECEIVER_AUTH_HOST_URL,
    {
      access_token: {
        access: [
          {
            type: 'incoming-payment',
            actions: ['create', 'read', 'list', 'complete']
          }
        ]
      },
      client: CLIENT_WALLET_ADDRESS
    },
    {} // No headers
  )
  check(rspGrantReqInPay, {
    'grant request incoming payment': (r) => r.status === 200
  })
  const rspGrantReqInPayData = JSON.parse(rspGrantReqInPay.body)
  console.log(
    `grant incoming-payment: ${JSON.stringify(rspGrantReqInPayData, null, 2)}`
  )

  if (
    !rspGrantReqInPayData.access_token ||
    !rspGrantReqInPayData.access_token.value
  ) {
    fail(`could not issue grant for incoming payment: ${rspGrantReqInPay.body}`)
    return
  }

  // bru.setEnvVar('accessToken', rspGrantReqInPayData.access_token.value)
  // bru.setEnvVar('tokenId', rspGrantReqInPayData.access_token.manage.split('/').pop())

  // 4. Create the Incoming Payment:
  const inPaymentAccessToken = rspGrantReqInPayData.access_token.value
  const inPaymentHeaders = {}
  inPaymentHeaders['Authorization'] = `GNAP ${inPaymentAccessToken}`

  const tomorrow = new Date(
    new Date().setDate(new Date().getDate() + 1)
  ).toISOString()
  const rspInPay = postWithSignatureHeaders(
    clientPrivateKeyB64,
    keyId,
    RECEIVER_BACKEND_HOST_URL,
    {
      walletAddress: RECEIVER_WALLET_ADDRESS,
      incomingAmount: {
        value: '100',
        assetCode: receiverWalletData.assetCode,
        assetScale: receiverWalletData.assetScale
      },
      expiresAt: tomorrow,
      metadata: {
        description: 'Free Money!'
      }
    },
    inPaymentHeaders
  )
  check(rspInPay, {
    'incoming payment': (r) => r.status === 200
  })
  const incomingPaymentId = rspInPay.id.split('/').pop()

  // 5. Grant Request Quote:
  const rspGrantReqQuote = postWithSignatureHeaders(
    clientPrivateKeyB64,
    keyId,
    SENDER_AUTH_HOST_URL,
    {
      access_token: {
        access: [
          {
            type: 'quote',
            actions: ['create', 'read']
          }
        ]
      },
      client: CLIENT_WALLET_ADDRESS
    },
    {} // No headers
  )
  check(rspGrantReqQuote, {
    'grant request quote': (r) => r.status === 200
  })
  const rspGrantReqQuoteData = JSON.parse(rspGrantReqQuote.body)
  console.log(`grant quote: ${JSON.stringify(rspGrantReqQuoteData, null, 2)}`)

  // 6. Create the Quote:
  const quoteAccessToken = rspGrantReqQuoteData.access_token.value
  const quoteHeaders = {}
  quoteHeaders['Authorization'] = `GNAP ${quoteAccessToken}`
  const rspQuote = postWithSignatureHeaders(
    clientPrivateKeyB64,
    keyId,
    SENDER_BACKEND_HOST_URL,
    {
      walletAddress: SENDER_WALLET_ADDRESS,
      receiver: `${SENDER_BACKEND_HOST_URL}/incoming-payments/${incomingPaymentId}`,
      method: 'ilp'
    },
    quoteHeaders
  )
  check(rspQuote, {
    quote: (r) => r.status === 200
  })

  // 7. Grant Request Outgoing Payment:
  const rspGrantReqOutPayment = postWithSignatureHeaders(
    clientPrivateKeyB64,
    keyId,
    SENDER_AUTH_HOST_URL,
    {
      access_token: {
        access: [
          {
            type: 'outgoing-payment',
            actions: ['create', 'read', 'list'],
            identifier: '{{senderWalletAddress}}',
            limits: {
              debitAmount: '{{quoteDebitAmount}}',
              receiveAmount: '{{quoteReceiveAmount}}'
            }
          }
        ]
      },
      client: CLIENT_WALLET_ADDRESS,
      interact: {
        start: ['redirect']
      }
    },
    {} // No headers
  )
  check(rspGrantReqOutPayment, {
    'grant request outgoing payment': (r) => r.status === 200
  })
  const rspGrantReqOutPaymentData = JSON.parse(rspGrantReqOutPayment.body)
  console.log(
    `grant outgoing payment: ${JSON.stringify(rspGrantReqOutPaymentData, null, 2)}`
  )

  // 8. Consent:
  const redirectUrl = rspGrantReqOutPaymentData.interact.redirect
  console.log(`The redirect url is: ${redirectUrl}`)

  const consentResponse = http.post(
    HTTP_CONSENT_SERVER,
    JSON.stringify({
      startInteractionUrl: redirectUrl,
      interactionFinish: '',
      interactionServer: '',
      idpSecret: ''
    }),
    {}
  )
  check(consentResponse, {
    consent: (r) => r.status === 200
  })

  // 9.
}

export function handleSummary(data) {
  const requestsPerSecond = data.metrics.http_reqs.values.rate
  const iterationsPerSecond = data.metrics.iterations.values.rate
  const failedRequests = data.metrics.http_req_failed.values.passes
  const failureRate = data.metrics.http_req_failed.values.rate
  const requests = data.metrics.http_reqs.values.count

  const summaryText = `
  **Test Configuration**:
  - VUs: ${options.vus}
  - Duration: ${options.duration}

  **Test Metrics**:
  - Requests/s: ${requestsPerSecond.toFixed(2)}
  - Iterations/s: ${iterationsPerSecond.toFixed(2)}
  - Failed Requests: ${failureRate.toFixed(2)}% (${failedRequests} of ${requests})
    `

  return {
    // Preserve standard output w/ textSummary
    stdout: textSummary(data, { enableColors: false }),
    'k6-test-summary.txt': summaryText // saves to file
  }
}
