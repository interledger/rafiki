import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import { v4 as uuid } from 'uuid'

import { randomAsset } from './asset'
import { AppServices } from '../app'
import { isPaymentPointerError } from '../open_payments/payment_pointer/errors'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import { CreateOptions } from '../open_payments/payment_pointer/service'

export async function createPaymentPointer(
  deps: IocContract<AppServices>,
  options: Partial<CreateOptions> = {}
): Promise<PaymentPointer> {
  const paymentPointerService = await deps.use('paymentPointerService')
  const paymentPointerOrError = await paymentPointerService.create({
    ...options,
    url:
      options.url || `${(await deps.use('config')).openPaymentsHost}/${uuid()}`,
    asset: options.asset || randomAsset()
  })
  assert.ok(!isPaymentPointerError(paymentPointerOrError))
  return paymentPointerOrError
}
