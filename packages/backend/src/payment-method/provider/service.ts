import { BaseService } from '../../shared/baseService'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { StreamCredentialsService } from '../ilp/stream-credentials/service'
import { SepaPaymentService } from '../sepa/service'
import base64url from 'base64url'
import { IAppConfig } from '../../config/app'

interface BasePaymentMethod {
  type: 'ilp' | 'sepa'
}

interface IlpPaymentMethod extends BasePaymentMethod {
  type: 'ilp'
  ilpAddress: string
  sharedSecret: string
}

interface SepaPaymentMethod extends BasePaymentMethod {
  type: 'sepa'
  iban: string
  additionalProperties?: Record<string, unknown>
}

export type OpenPaymentsPaymentMethod = IlpPaymentMethod | SepaPaymentMethod

export interface PaymentMethodProviderService {
  getPaymentMethods(
    incomingPayment: IncomingPayment
  ): Promise<OpenPaymentsPaymentMethod[]>
}

interface ServiceDependencies extends BaseService {
  streamCredentialsService: StreamCredentialsService
  sepaPaymentService: SepaPaymentService
  config: IAppConfig
}

export async function createPaymentMethodProviderService({
  logger,
  knex,
  config,
  streamCredentialsService,
  sepaPaymentService,
}: ServiceDependencies): Promise<PaymentMethodProviderService> {
  const log = logger.child({
    service: 'PaymentMethodProvider'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    config,
    streamCredentialsService,
    sepaPaymentService,
  }

  return {
    getPaymentMethods: (incomingPayment) =>
      getPaymentMethods(deps, incomingPayment)
  }
}

async function getPaymentMethods(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<OpenPaymentsPaymentMethod[]> {
  const paymentMethods: OpenPaymentsPaymentMethod[] = []

  // Generate ILP payment method
  const ilpPaymentMethod = await generateIlpPaymentMethod(deps, incomingPayment)
  if (ilpPaymentMethod) {
    paymentMethods.push(ilpPaymentMethod)
  }

  // Generate SEPA payment method
  const sepaPaymentMethod = await generateSepaPaymentMethod(deps, incomingPayment)
  if (sepaPaymentMethod) {
    paymentMethods.push(sepaPaymentMethod)
  }

  return paymentMethods
}

async function generateIlpPaymentMethod(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<IlpPaymentMethod | undefined> {
  const ilpStreamCredentials = deps.streamCredentialsService.get({
    paymentTag: incomingPayment.id,
    ilpAddress: deps.config.ilpAddress,
    asset: {
      code: incomingPayment.asset.code,
      scale: incomingPayment.asset.scale
    }
  })

  if (!ilpStreamCredentials) {
    deps.logger.error(
      {
        incomingPaymentId: incomingPayment.id
      },
      'Could not get generate ILP STREAM credentials when generating ILP payment method'
    )
    return
  }

  return {
    type: 'ilp',
    ilpAddress: ilpStreamCredentials.ilpAddress,
    sharedSecret: base64url(ilpStreamCredentials.sharedSecret)
  }
}

async function generateSepaPaymentMethod(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<SepaPaymentMethod | undefined> {
  const sepaDetails = await deps.sepaPaymentService.getSepaDetails(
    incomingPayment.walletAddressId,
    'sepa'
  )
  
  if (!sepaDetails) {
    deps.logger.debug(
      {
        walletAddressId: incomingPayment.walletAddressId,
        paymentMethodType: 'sepa'
      },
      'Could not get SEPA details when generating SEPA payment method'
    )
    return undefined
  }

  return {
    type: 'sepa',
    iban: sepaDetails.iban,
    additionalProperties: sepaDetails.additionalProperties
  }
}