import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { CreateIncomingPaymentOptions } from '../open_payments/payment/incoming/service'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { Receiver } from '../open_payments/receiver/model'
import { createIncomingPayment } from './incomingPayment'
import { OpenPaymentsPaymentMethod } from '../payment-method/provider/service'

type CreateReceiverOptions = Omit<
  CreateIncomingPaymentOptions,
  'walletAddressId'
> & {
  paymentMethods?: OpenPaymentsPaymentMethod[]
}

export async function createReceiver(
  deps: IocContract<AppServices>,
  walletAddress: WalletAddress,
  options?: CreateReceiverOptions
): Promise<Receiver> {
  const config = await deps.use('config')
  const paymentMethodProviderService = await deps.use(
    'paymentMethodProviderService'
  )

  const incomingPayment = await createIncomingPayment(deps, {
    ...options,
    walletAddressId: walletAddress.id,
    tenantId: options?.tenantId ?? config.operatorTenantId
  })

  return new Receiver(
    incomingPayment.toOpenPaymentsTypeWithMethods(
      config.openPaymentsUrl,
      walletAddress,
      options?.paymentMethods ||
        (await paymentMethodProviderService.getPaymentMethods(incomingPayment))
    ),
    false
  )
}
