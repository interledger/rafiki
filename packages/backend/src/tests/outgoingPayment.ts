import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import * as Pay from '@interledger/pay'

import { createQuote, CreateTestQuoteOptions } from './quote'
import { AppServices } from '../app'
import { isOutgoingPaymentError } from '../open_payments/payment/outgoing/errors'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { CreateOutgoingPaymentOptions } from '../open_payments/payment/outgoing/service'

export async function createOutgoingPayment(
  deps: IocContract<AppServices>,
  options: Omit<
    CreateOutgoingPaymentOptions & CreateTestQuoteOptions,
    'quoteId'
  >
): Promise<OutgoingPayment> {
  const quote = await createQuote(deps, options)
  const outgoingPaymentService = await deps.use('outgoingPaymentService')
  if (options.validDestination === false) {
    const streamServer = await deps.use('streamServer')
    const { ilpAddress, sharedSecret } = streamServer.generateCredentials()
    jest.spyOn(Pay, 'setupPayment').mockResolvedValueOnce({
      destinationAsset: {
        code: quote.receiveAmount.assetCode,
        scale: quote.receiveAmount.assetScale
      },
      destinationAddress: ilpAddress,
      sharedSecret,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      requestCounter: Pay.Counter.from(0)!
    })
  }
  const outgoingPaymentOrError = await outgoingPaymentService.create({
    ...options,
    quoteId: quote.id
  })
  assert.ok(!isOutgoingPaymentError(outgoingPaymentOrError))

  const accountingService = await deps.use('accountingService')
  await accountingService.createLiquidityAccount(outgoingPaymentOrError)

  return outgoingPaymentOrError
}
