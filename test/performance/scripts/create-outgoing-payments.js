import http from 'k6/http'
import { fail } from 'k6'
import { createHMAC } from 'k6/crypto'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'
import { canonicalize } from '../dist/json-canonicalize.bundle.js'

export const options = {
  // A number specifying the number of VUs to run concurrently.
  vus: 1,
  // A string specifying the total duration of the test run.
  duration: '600s'
}

const CLOUD_NINE_GQL_ENDPOINT = 'http://cloud-nine-wallet-backend:3001/graphql'
const CLOUD_NINE_WALLET_ADDRESS =
  'https://cloud-nine-wallet-backend/accounts/gfranklin'
const HAPPY_LIFE_BANK_WALLET_ADDRESS =
  'https://happy-life-bank-backend/accounts/pfry'
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
    signature: `t=${timestamp}, v${SIGNATURE_VERSION}=${digest}, n=${uuidv4()}`
  }
}

function request(query) {
  const headers = generateSignedHeaders(query)
  const response = http.post(CLOUD_NINE_GQL_ENDPOINT, JSON.stringify(query), {
    headers
  })

  if (response.status !== 200) {
    fail(`GraphQL Request failed`)
  }
  return JSON.parse(response.body).data
}

export function setup() {
  const query = {
    query: `
      query GetWalletAddresses {
        walletAddresses {
          edges {
            node {
              id
              url
            }
          }
        }
      }
    `
  }

  const data = request(query)
  const c9WalletAddresses = data.walletAddresses.edges
  const c9WalletAddress = c9WalletAddresses.find(
    (edge) => edge.node.url === CLOUD_NINE_WALLET_ADDRESS
  ).node
  if (!c9WalletAddress) {
    fail(`could not find wallet address: ${CLOUD_NINE_WALLET_ADDRESS}`)
  }

  return { data: { c9WalletAddress } }
}

// The function that defines VU logic.
//
// See https://grafana.com/docs/k6/latest/examples/get-started-with-k6/ to learn more
// about authoring k6 scripts.
//
export default function (data) {
  const {
    data: { c9WalletAddress }
  } = data

  const createReceiverPayload = {
    query: `
      mutation CreateReceiver($input: CreateReceiverInput!) {
        createReceiver(input: $input) {
          receiver {
            id
          }
        }
      }
    `,
    variables: {
      input: {
        expiresAt: null,
        metadata: {
          description: 'Hello my friend',
          externalRef: null
        },
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 1002
        },
        walletAddressUrl: HAPPY_LIFE_BANK_WALLET_ADDRESS
      }
    }
  }

  const createReceiverResponse = request(createReceiverPayload)
  const receiver = createReceiverResponse.createReceiver.receiver

  const createQuotePayload = {
    query: `
        mutation CreateQuote($input: CreateQuoteInput!) {
          createQuote(input: $input) {
            quote {
              id
            }
          }
        }
      `,
    variables: {
      input: {
        walletAddressId: c9WalletAddress.id,
        receiveAmount: null,
        receiver: receiver.id,
        debitAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 500
        }
      }
    }
  }

  const createQuoteResponse = request(createQuotePayload)
  const quote = createQuoteResponse.createQuote.quote

  const createOutgoingPaymentPayload = {
    query: `
      mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
        createOutgoingPayment(input: $input) {
          payment {
            id
          }
        }
      }
    `,
    variables: {
      input: {
        walletAddressId: c9WalletAddress.id,
        quoteId: quote.id
      }
    }
  }

  request(createOutgoingPaymentPayload)
}
