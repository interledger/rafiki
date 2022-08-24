import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import * as Pay from '@interledger/pay'

import { randomAsset } from './asset'
import { AppServices } from '../app'
import { AssetOptions } from '../asset/service'
import { Quote } from '../open_payments/quote/model'
import { CreateQuoteOptions } from '../open_payments/quote/service'

export type CreateTestQuoteOptions = CreateQuoteOptions & {
  validDestination?: boolean
}

export async function createQuote(
  deps: IocContract<AppServices>,
  {
    paymentPointerId,
    receiver,
    sendAmount,
    receiveAmount,
    validDestination = true
  }: CreateTestQuoteOptions
): Promise<Quote> {
  const paymentPointerService = await deps.use('paymentPointerService')
  const paymentPointer = await paymentPointerService.get(paymentPointerId)
  assert.ok(paymentPointer)
  assert.ok(
    !sendAmount ||
      (paymentPointer.asset.code === sendAmount.assetCode &&
        paymentPointer.asset.scale === sendAmount.assetScale)
  )

  const config = await deps.use('config')
  let receiveAsset: AssetOptions | undefined
  if (validDestination) {
    assert.ok(receiver.startsWith(config.openPaymentsHost))
    const path = receiver.slice(config.openPaymentsHost.length + 1).split('/')
    assert.ok(path.length === 3)
    const incomingPaymentService = await deps.use('incomingPaymentService')
    const incomingPayment = await incomingPaymentService.get(path[2])
    assert.ok(incomingPayment)
    assert.ok(incomingPayment.incomingAmount || receiveAmount || sendAmount)
    if (receiveAmount) {
      assert.ok(
        incomingPayment.asset.code === receiveAmount.assetCode &&
          incomingPayment.asset.scale === receiveAmount.assetScale
      )
      assert.ok(
        !incomingPayment.incomingAmount ||
          receiveAmount.value <= incomingPayment.incomingAmount.value
      )
    } else {
      receiveAsset = {
        code: incomingPayment.asset.code,
        scale: incomingPayment.asset.scale
      }
      if (!sendAmount) {
        receiveAmount = incomingPayment.incomingAmount
      }
    }
  } else {
    receiveAsset = randomAsset()
    if (!sendAmount && !receiveAmount) {
      receiveAmount = {
        value: BigInt(56),
        assetCode: receiveAsset.code,
        assetScale: receiveAsset.scale
      }
    }
  }

  if (sendAmount) {
    assert.ok(receiveAsset)
    receiveAmount = {
      value: BigInt(
        Math.ceil(Number(sendAmount.value) / (2 * (1 + config.slippage)))
      ),
      assetCode: receiveAsset.code,
      assetScale: receiveAsset.scale
    }
  } else {
    assert.ok(receiveAmount)
    sendAmount = {
      value: BigInt(
        Math.ceil(Number(receiveAmount.value) * 2 * (1 + config.slippage))
      ),
      assetCode: paymentPointer.asset.code,
      assetScale: paymentPointer.asset.scale
    }
  }

  return await Quote.query()
    .insertAndFetch({
      paymentPointerId,
      assetId: paymentPointer.assetId,
      receiver,
      sendAmount,
      receiveAmount,
      maxPacketAmount: BigInt('9223372036854775807'),
      lowEstimatedExchangeRate: Pay.Ratio.of(
        Pay.Int.from(500000000000n) as Pay.PositiveInt,
        Pay.Int.from(1000000000000n) as Pay.PositiveInt
      ),
      highEstimatedExchangeRate: Pay.Ratio.of(
        Pay.Int.from(500000000001n) as Pay.PositiveInt,
        Pay.Int.from(1000000000000n) as Pay.PositiveInt
      ),
      minExchangeRate: Pay.Ratio.of(
        Pay.Int.from(495n) as Pay.PositiveInt,
        Pay.Int.from(1000n) as Pay.PositiveInt
      ),
      expiresAt: new Date(Date.now() + config.quoteLifespan)
    })
    .withGraphFetched('asset')
}
