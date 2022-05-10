import assert from 'assert'
import { IocContract } from '@adonisjs/fold'

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
  const outgoingPaymentOrError = await outgoingPaymentService.create({
    ...options,
    quoteId: quote.id
  })
  assert.ok(!isOutgoingPaymentError(outgoingPaymentOrError))
  return outgoingPaymentOrError
}
