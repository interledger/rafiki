import http from 'k6/http'
import { Trend } from 'k6/metrics'

import { check } from 'k6'

export const options = {
  vus: 2,
  // duration: '1m'
  iterations: 1000
}

const receiverTrend = new Trend('receiver_trend')
const quotingTrend = new Trend('quoting_trend')
const outgoingPaymentTrend = new Trend('outgoing_payment_trend')

const NODE_1_URL = 'http://localhost:3001/graphql'
const WALLET_ADDRESS = '5aae3dc0-c349-4fe9-bfe6-24e27be508ae'

async function createReceiver() {
  const query = `
    mutation CreateReceiver($input: CreateReceiverInput!) {
      createReceiver(input: $input) {
        code
        message
        receiver {
          completed
          createdAt
          expiresAt
          metadata
          id
          incomingAmount {
            assetCode
            assetScale
            value
          }
          walletAddressUrl
          receivedAmount {
            assetCode
            assetScale
            value
          }
          updatedAt
        }
        success
      }
    }`

  // Define the GraphQL endpoint URL

  const variables = {
    input: {
      metadata: {
        description: 'For lunch!'
      },
      incomingAmount: {
        assetCode: 'USD',
        assetScale: 2,
        value: 100
      },
      walletAddressUrl: 'https://happy-life-bank-backend/accounts/pfry'
    }
  }

  return http.post(NODE_1_URL, JSON.stringify({ query, variables }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

async function createQuote(args) {
  const query = `
    mutation CreateQuote($input: CreateQuoteInput!) {
        createQuote(input: $input) {
          code
          message
          quote {
            createdAt
            expiresAt
            highEstimatedExchangeRate
            id
            lowEstimatedExchangeRate
            maxPacketAmount
            minExchangeRate
            walletAddressId
            receiveAmount {
              assetCode
              assetScale
              value
            }
            receiver
            debitAmount {
              assetCode
              assetScale
              value
            }
          }
        }
      }`

  const variables = {
    input: {
      walletAddressId: WALLET_ADDRESS,
      receiver: args.receiverId
    }
  }
  return http.post(NODE_1_URL, JSON.stringify({ query, variables }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

async function createOutgoingPayment(args) {
  const query = `
    mutation CreateOutgoingPayment($input: CreateOutgoingPaymentInput!) {
        createOutgoingPayment(input: $input) {
          code
          message
          payment {
            createdAt
            error
            metadata
            id
            walletAddressId
            receiveAmount {
              assetCode
              assetScale
              value
            }
            receiver
            debitAmount {
              assetCode
              assetScale
              value
            }
            sentAmount {
              assetCode
              assetScale
              value
            }
            state
            stateAttempts
          }
          success
        }
      }`

  const variables = {
    input: {
      walletAddressId: WALLET_ADDRESS,
      quoteId: args.quoteId
    }
  }

  return http.post(NODE_1_URL, JSON.stringify({ query, variables }), {
    headers: { 'Content-Type': 'application/json' }
  })
}

export default async function () {
  let receiver

  check(await createReceiver(), {
    'Receiver is created': (receiverResult) => {
      receiverTrend.add(receiverResult.timings.duration)

      receiver = receiverResult.json().data.createReceiver.receiver

      if (!receiver) {
        console.log(receiverResult)
        return false
      }

      return true
    }
  })

  let quote

  check(await createQuote({ receiverId: receiver.id }), {
    'Quote is created': (quoteResult) => {
      quotingTrend.add(quoteResult.timings.duration)

      quote = quoteResult.json().data.createQuote.quote

      if (!quote) {
        console.log(quoteResult)
        return false
      }

      return true
    }
  })

  check(
    await createOutgoingPayment({
      quoteId: quote.id
    }),
    {
      'Outgoing payment is created': (outgoingPaymentResult) => {
        outgoingPaymentTrend.add(outgoingPaymentResult.timings.duration)

        const outgoingPayment =
          outgoingPaymentResult.json().data.createOutgoingPayment

        if (!outgoingPayment) {
          console.log(outgoingPaymentResult)
          return false
        }

        return true
      }
    }
  )
}
