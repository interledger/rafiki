import {
  AuthenticatedClient,
  IncomingPayment as OpenPaymentsIncomingPayment,
  isNonInteractiveGrant,
  AccessType,
  AccessAction
} from 'open-payments'
import { Grant } from '../../grant/model'
import { GrantService } from '../../grant/service'
import { BaseService } from '../../../shared/baseService'
import { Amount, serializeAmount } from '../../amount'

interface CreateRemoteIncomingPaymentArgs {
  paymentPointerUrl: string
  description?: string
  expiresAt?: Date
  incomingAmount?: Amount
  externalRef?: string
}

export interface RemoteIncomingPaymentService {
  create(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<OpenPaymentsIncomingPayment>
}

interface ServiceDependencies extends BaseService {
  grantService: GrantService
  openPaymentsUrl: string
  openPaymentsClient: AuthenticatedClient
}

export async function createRemoteIncomingPaymentService(
  deps_: ServiceDependencies
): Promise<RemoteIncomingPaymentService> {
  const log = deps_.logger.child({
    service: 'RemoteIncomingPaymentService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }

  return {
    create: (args) => create(deps, args)
  }
}

async function create(
  deps: ServiceDependencies,
  args: CreateRemoteIncomingPaymentArgs
): Promise<OpenPaymentsIncomingPayment> {
  const { paymentPointerUrl } = args
  const grant = await getGrant(deps, paymentPointerUrl, [
    AccessAction.Create,
    AccessAction.ReadAll
  ])

  if (!grant?.accessToken) {
    const errorMessage = 'Grant has undefined accessToken'
    deps.logger.warn({ grantId: grant?.id, paymentPointerUrl }, errorMessage)
    throw new Error(errorMessage)
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.create(
      {
        paymentPointer: paymentPointerUrl,
        accessToken: grant.accessToken
      },
      {
        incomingAmount: args.incomingAmount
          ? serializeAmount(args.incomingAmount)
          : undefined,
        description: args.description,
        expiresAt: args.expiresAt?.toISOString(),
        externalRef: args.externalRef
      }
    )
  } catch (error) {
    const errorMessage = 'Error creating remote incoming payment'
    deps.logger.error({ error, paymentPointerUrl }, errorMessage)
    throw new Error(errorMessage, { cause: error })
  }
}

async function getGrant(
  deps: ServiceDependencies,
  paymentPointerUrl: string,
  accessActions: AccessAction[]
): Promise<Grant> {
  const paymentPointer = await deps.openPaymentsClient.paymentPointer.get({
    url: paymentPointerUrl
  })

  if (!paymentPointer) {
    const errorMessage = 'Could not get payment pointer'
    deps.logger.error({ paymentPointerUrl }, errorMessage)
    throw new Error(errorMessage)
  }

  const grantOptions = {
    authServer: paymentPointer.authServer,
    accessType: AccessType.IncomingPayment,
    accessActions
  }

  const existingGrant = await deps.grantService.get(grantOptions)

  if (existingGrant) {
    if (existingGrant.expired) {
      // TODO https://github.com/interledger/rafiki/issues/795
      const errorMessage = 'Grant access token expired'
      deps.logger.error({ grantOptions }, errorMessage)
      throw new Error(errorMessage)
    }
    return existingGrant
  }

  const grant = await deps.openPaymentsClient.grant.request(
    { url: paymentPointer.authServer },
    {
      access_token: {
        access: [
          {
            type: grantOptions.accessType as 'incoming-payment',
            actions: grantOptions.accessActions
          }
        ]
      },
      interact: {
        start: ['redirect']
      }
    }
  )

  if (isNonInteractiveGrant(grant)) {
    return deps.grantService.create({
      ...grantOptions,
      accessToken: grant.access_token.value,
      expiresIn: grant.access_token.expires_in
    })
  }

  const errorMessage = 'Grant request required interaction'
  deps.logger.warn({ grantOptions }, errorMessage)
  throw new Error(errorMessage)
}
