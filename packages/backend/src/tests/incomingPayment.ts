import assert from 'assert'
import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isIncomingPaymentError } from '../open_payments/payment/incoming/errors'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { CreateIncomingPaymentOptions } from '../open_payments/payment/incoming/service'

export async function createIncomingPayment(
  deps: IocContract<AppServices>,
  options: CreateIncomingPaymentOptions
): Promise<IncomingPayment> {
  const incomingPaymentService = await deps.use('incomingPaymentService')
  const incomingPaymentOrError = await incomingPaymentService.create(options)
  assert.ok(!isIncomingPaymentError(incomingPaymentOrError))

  const accountingService = await deps.use('accountingService')
  await accountingService.createLiquidityAccount(incomingPaymentOrError)

  return incomingPaymentOrError
}
