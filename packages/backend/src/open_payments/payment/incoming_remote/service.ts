import {
  AuthenticatedClient,
  IncomingPayment as OpenPaymentsIncomingPayment,
  isPendingGrant,
  AccessAction,
  PaymentPointer as OpenPaymentsPaymentPointer
} from 'open-payments'
import { Grant } from '../../grant/model'
import { GrantService } from '../../grant/service'
import { BaseService } from '../../../shared/baseService'
import { Amount, serializeAmount } from '../../amount'
import {
  isRemoteIncomingPaymentError,
  RemoteIncomingPaymentError
} from './errors'

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
  ): Promise<OpenPaymentsIncomingPayment | RemoteIncomingPaymentError>
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
): Promise<OpenPaymentsIncomingPayment | RemoteIncomingPaymentError> {
  const { paymentPointerUrl } = args
  const grantOrError = await getGrant(deps, paymentPointerUrl, [
    AccessAction.Create,
    AccessAction.ReadAll
  ])

  if (isRemoteIncomingPaymentError(grantOrError)) {
    return grantOrError
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.create(
      {
        paymentPointer: paymentPointerUrl,
        accessToken: grantOrError.accessToken
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
    return RemoteIncomingPaymentError.InvalidRequest
  }
}

async function getGrant(
  deps: ServiceDependencies,
  paymentPointerUrl: string,
  accessActions: AccessAction[]
): Promise<Grant | RemoteIncomingPaymentError> {
  let paymentPointer: OpenPaymentsPaymentPointer

  try {
    paymentPointer = await deps.openPaymentsClient.paymentPointer.get({
      url: paymentPointerUrl
    })
  } catch (error) {
    const errorMessage = 'Could not get payment pointer'
    deps.logger.error({ paymentPointerUrl, error }, errorMessage)
    return RemoteIncomingPaymentError.UnknownPaymentPointer
  }

  const grantOptions = {
    authServer: paymentPointer.authServer,
    accessType: 'incoming-payment' as const,
    accessActions
  }

  const existingGrant = await deps.grantService.get(grantOptions)

  if (existingGrant) {
    if (existingGrant.expired) {
      if (!existingGrant.authServer) {
        throw new Error('unknown auth server')
      }
      try {
        const rotatedToken = await deps.openPaymentsClient.token.rotate({
          url: existingGrant.getManagementUrl(existingGrant.authServer.url),
          accessToken: existingGrant.accessToken
        })
        return deps.grantService.update(existingGrant, {
          accessToken: rotatedToken.access_token.value,
          managementUrl: rotatedToken.access_token.manage,
          expiresIn: rotatedToken.access_token.expires_in
        })
      } catch (err) {
        deps.logger.error({ err, grantOptions }, 'Grant token rotation failed.')
        throw err
      }
    }
    return existingGrant
  }

  const grant = await deps.openPaymentsClient.grant.request(
    { url: paymentPointer.authServer },
    {
      access_token: {
        access: [
          {
            type: grantOptions.accessType,
            actions: grantOptions.accessActions
          }
        ]
      },
      interact: {
        start: ['redirect']
      }
    }
  )

  if (!isPendingGrant(grant)) {
    return deps.grantService.create({
      ...grantOptions,
      accessToken: grant.access_token.value,
      managementUrl: grant.access_token.manage,
      expiresIn: grant.access_token.expires_in
    })
  }

  const errorMessage = 'Grant is pending/requires interaction'
  deps.logger.warn({ grantOptions }, errorMessage)
  return RemoteIncomingPaymentError.InvalidGrant
}
