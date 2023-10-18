import base64url from 'base64url'
import { IocContract } from '@adonisjs/fold'

import { createQuote, CreateTestQuoteOptions } from './quote'
import { AppServices } from '../app'
import { Receiver } from '../open_payments/receiver/model'
import { isOutgoingPaymentError } from '../open_payments/payment/outgoing/errors'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { CreateOutgoingPaymentOptions } from '../open_payments/payment/outgoing/service'
import { LiquidityAccountType } from '../accounting/service'
import { createIncomingPayment } from './incomingPayment'
import assert from 'assert'

export async function createOutgoingPayment(
  deps: IocContract<AppServices>,
  options: Omit<
    CreateOutgoingPaymentOptions & CreateTestQuoteOptions,
    'quoteId'
  >
): Promise<OutgoingPayment> {
  const quoteOptions: CreateTestQuoteOptions = {
    walletAddressId: options.walletAddressId,
    client: options.client,
    receiver: options.receiver,
    validDestination: options.validDestination
  }
  if (options.debitAmount) quoteOptions.debitAmount = options.debitAmount
  if (options.receiveAmount) quoteOptions.receiveAmount = options.receiveAmount
  const quote = await createQuote(deps, quoteOptions)
  const outgoingPaymentService = await deps.use('outgoingPaymentService')
  const receiverService = await deps.use('receiverService')
  if (options.validDestination === false) {
    const paymentPointerService = await deps.use('paymentPointerService')
    const streamServer = await deps.use('streamServer')
    const connection = streamServer.generateCredentials()

    const incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId: options.paymentPointerId
    })
    const paymentPointer = await paymentPointerService.get(
      options.paymentPointerId
    )
    assert(paymentPointer)
    jest
      .spyOn(receiverService, 'get')
      .mockResolvedValueOnce(
        new Receiver(
          incomingPayment.toOpenPaymentsType(paymentPointer, connection)
        )
      )
  }
  const outgoingPaymentOrError = await outgoingPaymentService.create({
    ...options,
    quoteId: quote.id
  })
  if (isOutgoingPaymentError(outgoingPaymentOrError)) {
    throw new Error()
  }

  const accountingService = await deps.use('accountingService')
  await accountingService.createLiquidityAccount(
    outgoingPaymentOrError,
    LiquidityAccountType.OUTGOING
  )

  return outgoingPaymentOrError
}
