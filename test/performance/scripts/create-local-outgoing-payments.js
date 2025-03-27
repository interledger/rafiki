import http from 'k6/http'
import { fail } from 'k6'
import { createHMAC } from 'k6/crypto'
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js'
import { canonicalize } from '../dist/json-canonicalize.bundle.js'

export const options = {
  vus: 25,
  duration: '120s'
}

const GQL_ENDPOINT = 'http://cloud-nine-wallet-backend:3001/graphql'
const SENDER_WALLET_ADDRESS =
  'https://cloud-nine-wallet-backend/accounts/gfranklin'
const RECEIVER_WALLET_ADDRESS =
  'https://cloud-nine-wallet-backend/accounts/bhamchest'
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
  const response = http.post(GQL_ENDPOINT, JSON.stringify(query), {
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
  const senderWalletAddress = c9WalletAddresses.find(
    (edge) => edge.node.url === SENDER_WALLET_ADDRESS
  ).node
  if (!senderWalletAddress) {
    fail(`could not find wallet address: ${SENDER_WALLET_ADDRESS}`)
  }
  const receiverWalletAddress = c9WalletAddresses.find(
    (edge) => edge.node.url === RECEIVER_WALLET_ADDRESS
  ).node
  if (!receiverWalletAddress) {
    fail(`could not find wallet address: ${RECEIVER_WALLET_ADDRESS}`)
  }

  return { senderWalletAddress, receiverWalletAddress }
}

// The function that defines VU logic.
//
// See https://grafana.com/docs/k6/latest/examples/get-started-with-k6/ to learn more
// about authoring k6 scripts.
//
export default function (data) {
  const { senderWalletAddress, receiverWalletAddress } = data

  const createIncomingPaymentPayload = {
    query: `
      mutation CreateIncomingPayment($input: CreateIncomingPaymentInput!) {
        createIncomingPayment(input: $input) {
          payment {
            id
          }
        }
      }
    `,
    variables: {
      input: {
        expiresAt: null,
        incomingAmount: {
          assetCode: 'USD',
          assetScale: 2,
          value: 1002
        },
        walletAddressId: receiverWalletAddress.id
      }
    }
  }

  const createIncomingPaymentResponse = request(createIncomingPaymentPayload)
  const incomingPayment =
    createIncomingPaymentResponse.createIncomingPayment.payment

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
        walletAddressId: senderWalletAddress.id,
        receiveAmount: null,
        receiver: `https://cloud-nine-wallet-backend/incoming-payments/${incomingPayment.id}`,
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
        walletAddressId: senderWalletAddress.id,
        quoteId: quote.id
      }
    }
  }

  request(createOutgoingPaymentPayload)
}
