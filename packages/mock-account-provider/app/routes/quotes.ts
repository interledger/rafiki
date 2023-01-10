import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'

import { CONFIG } from '~/lib/parse_config'

export type Amount = {
  value: string // bigint
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
  sendAmount: Amount
  receiveAmount: Amount
  maxPacketAmount: number // bigint
  minExchangeRate: number
  lowEstimatedExchangeRate: number
  highEstimatedExchangeRate: number
  createdAt: string
  expiresAt: string
}

export async function action({ request }: ActionArgs) {
  const receivedQuote: Quote = await request.json()

  const feeStructure = CONFIG.seed.fees[0]
  const asset = CONFIG.seed.asset
  if (receivedQuote.paymentType == PaymentType.FixedDelivery) {
    // TODO: handle quote fee calculation for different assets/scales
    if (
      receivedQuote.sendAmount.assetCode !== asset.code ||
      receivedQuote.sendAmount.assetScale !== asset.scale
    ) {
      throw json('Invalid quote sendAmount asset', { status: 400 })
    }
    const sendAmountValue = BigInt(receivedQuote.sendAmount.value)
    const fees =
      // TODO: bigint/float multiplication
      BigInt(Math.floor(Number(sendAmountValue) * feeStructure.percentage)) +
      BigInt(feeStructure.fixed)

    receivedQuote.sendAmount.value = (sendAmountValue + fees).toString()
  } else if (receivedQuote.paymentType === PaymentType.FixedSend) {
    if (
      receivedQuote.receiveAmount.assetCode !== asset.code ||
      receivedQuote.receiveAmount.assetScale !== asset.scale
    ) {
      throw json('Invalid quote receiveAmount asset', { status: 400 })
    }
    const receiveAmountValue = BigInt(receivedQuote.receiveAmount.value)
    const fees =
      BigInt(Math.floor(Number(receiveAmountValue) * feeStructure.percentage)) +
      BigInt(feeStructure.fixed)

    if (receiveAmountValue <= fees) {
      throw json('Fees exceed quote receiveAmount', { status: 400 })
    }

    receivedQuote.receiveAmount.value = (receiveAmountValue - fees).toString()
  } else throw json('Invalid paymentType', { status: 400 })

  return json(receivedQuote, { status: 201 })
}
