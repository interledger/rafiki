import assert from 'assert'
import base64url from 'base64url'
import { IocContract } from '@adonisjs/fold'

import { createQuote, CreateTestQuoteOptions } from './quote'
import { AppServices } from '../app'
import { Receiver } from '../open_payments/receiver/model'
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
  const receiverService = await deps.use('receiverService')
  if (options.validDestination === false) {
    const streamServer = await deps.use('streamServer')
    const { ilpAddress, sharedSecret } = streamServer.generateCredentials()
    jest.spyOn(receiverService, 'get').mockResolvedValueOnce(
      Receiver.fromConnection({
        id: options.receiver,
        ilpAddress,
        sharedSecret: base64url(sharedSecret),
        assetCode: quote.receiveAmount.assetCode,
        assetScale: quote.receiveAmount.assetScale
      })
    )
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
