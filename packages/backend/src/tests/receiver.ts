import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { CreateIncomingPaymentOptions } from '../open_payments/payment/incoming/service'
import { PaymentPointer } from '../open_payments/payment_pointer/model'
import { Receiver } from '../open_payments/receiver/model'
import { createIncomingPayment } from './incomingPayment'

export async function createReceiver(
  deps: IocContract<AppServices>,
  paymentPointer: PaymentPointer,
  options?: Omit<CreateIncomingPaymentOptions, 'paymentPointerId'>
): Promise<Receiver> {
  const incomingPayment = await createIncomingPayment(deps, {
    ...options,
    paymentPointerId: paymentPointer.id
  })

  const connectionService = await deps.use('connectionService')

  return Receiver.fromIncomingPayment(
    incomingPayment.toOpenPaymentsType(
      paymentPointer,
      connectionService.get(incomingPayment)!
    )
  )
}
