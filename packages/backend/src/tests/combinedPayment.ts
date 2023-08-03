import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import {
  CombinedPayment,
  PaymentType
} from '../open_payments/payment/combined/model'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { createIncomingPayment } from './incomingPayment'
import { createOutgoingPayment } from './outgoingPayment'
import { Config } from '../config/app'
import { v4 as uuid } from 'uuid'
import { createAsset } from './asset'
import { createPaymentPointer } from './paymentPointer'

export function toCombinedPayment(
  type: PaymentType,
  payment: IncomingPayment | OutgoingPayment
) {
  return CombinedPayment.fromJson({
    type,
    id: payment.id,
    paymentPointerId: payment.paymentPointerId,
    state: payment.state,
    metadata: payment.metadata,
    client: payment.client,
    createdAt: payment.createdAt,
    updatedAt: payment.updatedAt
  })
}

/**
 * Creates a random payment (incoming or outgoing) and returns a combined payment object that represents it.
 * @param deps - the app service dependency container.
 * @returns A CombinedPayment object that represents the created payment.
 */
export async function createCombinedPayment(
  deps: IocContract<AppServices>
): Promise<CombinedPayment> {
  const sendAsset = await createAsset(deps)
  const receiveAsset = await createAsset(deps)
  const sendPaymentPointerId = (
    await createPaymentPointer(deps, { assetId: sendAsset.id })
  ).id
  const receivePaymentPointer = await createPaymentPointer(deps, {
    assetId: receiveAsset.id
  })

  const type = Math.random() < 0.5 ? PaymentType.Incoming : PaymentType.Outgoing
  const payment =
    type === PaymentType.Incoming
      ? await createIncomingPayment(deps, {
          paymentPointerId: receivePaymentPointer.id
        })
      : await createOutgoingPayment(deps, {
          paymentPointerId: sendPaymentPointerId,
          receiver: `${Config.publicHost}/${uuid()}`,
          validDestination: false
        })
  return toCombinedPayment(type, payment)
}
