import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

import { CONFIG } from '~/lib/parse_config'

export type Amount = {
  value: number // bigint
  assetCode: string
  assetScale: number
}

enum PaymentType {
  FixedSend = 'FixedSend',
  FixedDelivery = 'FixedDelivery'
}

export type Quote = {
  id: string
  paymentType: PaymentType
  paymentPointerId: string
  receiver: string
  sendAmount?: Amount
  receiveAmount?: Amount
  maxPacketAmount: number // bigint
  minExchangeRate: number
  lowEstimatedExchangeRate: number
  highEstimatedExchangeRate: number
  createdAt: string
  expiresAt: string
}

export async function action({ request }: ActionArgs) {
  const receivedQuote: Quote = await request.json()

  const feeStructure = CONFIG.fees[0]
  if (
    receivedQuote.paymentType == PaymentType.FixedDelivery &&
    receivedQuote.sendAmount
  ) {
    const fees =
      BigInt(receivedQuote.sendAmount.value * feeStructure.percentage) +
      BigInt(feeStructure.fixed * 10 ** feeStructure.scale)

    receivedQuote.sendAmount.value = Number(
      BigInt(receivedQuote.sendAmount.value) + fees
    )
  } else if (
    receivedQuote.paymentType === PaymentType.FixedSend &&
    receivedQuote.receiveAmount
  ) {
    const fees =
      BigInt(receivedQuote.receiveAmount.value * feeStructure.percentage) +
      BigInt(feeStructure.fixed * 10 ** feeStructure.scale)

    receivedQuote.receiveAmount.value = Number(
      BigInt(receivedQuote.receiveAmount.value) - fees
    )
  } else throw json('Invalid paymentType', { status: 400 })

  return json(receivedQuote, { status: 201 })
}
