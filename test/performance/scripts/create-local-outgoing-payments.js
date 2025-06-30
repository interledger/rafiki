import http from 'k6/http'
import { fail } from 'k6'

export const options = {
  vus: 10,
  duration: '60s'
}

const HEADERS = {
  'Content-Type': 'application/json'
}

const GQL_ENDPOINT = 'http://cloud-nine-wallet-backend:3001/graphql'
const SENDER_WALLET_ADDRESS =
  'https://cloud-nine-wallet-backend/accounts/gfranklin'
const RECEIVER_WALLET_ADDRESS =
  'https://cloud-nine-wallet-backend/accounts/bhamchest'

function request(query) {
  const response = http.post(GQL_ENDPOINT, JSON.stringify(query), {
    headers: HEADERS
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
  )?.node
  if (!senderWalletAddress) {
    fail(`could not find wallet address: ${SENDER_WALLET_ADDRESS}`)
  }

  const receiverWalletAddress = c9WalletAddresses.find(
    (edge) => edge.node.url === RECEIVER_WALLET_ADDRESS
  )?.node
  if (!receiverWalletAddress) {
    fail(`could not find wallet address: ${RECEIVER_WALLET_ADDRESS}`)
  }

  return { senderWalletAddress, receiverWalletAddress }
}

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
