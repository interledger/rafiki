import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isIncomingPaymentError } from '../open_payments/payment/incoming/errors'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { UpdateOptions } from '../open_payments/payment/incoming/service'

export async function updateIncomingPayment(
  deps: IocContract<AppServices>,
  options: UpdateOptions
): Promise<IncomingPayment> {
  const incomingPaymentService = await deps.use('incomingPaymentService')
  const incomingPaymentOrError = await incomingPaymentService.update(options)
  if (isIncomingPaymentError(incomingPaymentOrError)) {
    throw incomingPaymentOrError
  }

  return incomingPaymentOrError
}
