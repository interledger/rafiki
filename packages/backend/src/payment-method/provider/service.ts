import { BaseService } from '../../shared/baseService'
import { IncomingPayment } from '../../open_payments/payment/incoming/model'
import { StreamCredentialsService } from '../ilp/stream-credentials/service'
import { TenantSettingService } from '../../tenants/settings/service'
import { TenantSettingKeys } from '../../tenants/settings/model'
import base64url from 'base64url'
import { IAppConfig } from '../../config/app'

interface BasePaymentMethod {
  type: 'ilp'
}

interface IlpPaymentMethod extends BasePaymentMethod {
  type: 'ilp'
  ilpAddress: string
  sharedSecret: string
}

export type OpenPaymentsPaymentMethod = IlpPaymentMethod

export interface PaymentMethodProviderService {
  getPaymentMethods(
    incomingPayment: IncomingPayment
  ): Promise<OpenPaymentsPaymentMethod[]>
}

interface ServiceDependencies extends BaseService {
  streamCredentialsService: StreamCredentialsService
  tenantSettingsService: TenantSettingService
  config: IAppConfig
}

export async function createPaymentMethodProviderService({
  logger,
  knex,
  config,
  streamCredentialsService,
  tenantSettingsService
}: ServiceDependencies): Promise<PaymentMethodProviderService> {
  const log = logger.child({
    service: 'PaymentMethodProvider'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex,
    config,
    streamCredentialsService,
    tenantSettingsService
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
  const ilpPaymentMethod = await generateIlpPaymentMethod(deps, incomingPayment)

  return ilpPaymentMethod ? [ilpPaymentMethod] : []
}

async function generateIlpPaymentMethod(
  deps: ServiceDependencies,
  incomingPayment: IncomingPayment
): Promise<IlpPaymentMethod | undefined> {
  let tenantIlpAddress

  if (deps.config.operatorTenantId === incomingPayment.tenantId) {
    tenantIlpAddress = deps.config.ilpAddress
  } else {
    const tenantSettings = await deps.tenantSettingsService.get({
      tenantId: incomingPayment.tenantId,
      key: TenantSettingKeys.ILP_ADDRESS.name
    })

    if (tenantSettings.length === 0) {
      deps.logger.error(
        {
          tenantId: incomingPayment.tenantId,
          incomingPaymentId: incomingPayment.id
        },
        'Could not get tenant settings for tenant when generating ILP payment method'
      )
      return
    }

    tenantIlpAddress = tenantSettings[0].value
  }

  const ilpStreamCredentials = deps.streamCredentialsService.get({
    paymentTag: incomingPayment.id,
    ilpAddress: tenantIlpAddress,
    asset: {
      code: incomingPayment.asset.code,
      scale: incomingPayment.asset.scale
    }
  })

  if (!ilpStreamCredentials) {
    deps.logger.error(
      {
        tenantId: incomingPayment.tenantId,
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
