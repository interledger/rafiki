import {
  AuthenticatedClient,
  IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethods,
  AccessAction,
  WalletAddress as OpenPaymentsWalletAddress,
  AccessType,
  PublicIncomingPayment,
  OpenPaymentsClientError,
  WalletAddress
} from '@interledger/open-payments'
import { GrantService } from '../../grant/service'
import { BaseService } from '../../../shared/baseService'
import { Amount, serializeAmount } from '../../amount'
import { RemoteIncomingPaymentError } from './errors'
import { isGrantError } from '../../grant/errors'

interface CreateRemoteIncomingPaymentArgs {
  walletAddressUrl: string
  expiresAt?: Date
  incomingAmount?: Amount
  metadata?: Record<string, unknown>
}

export interface RemoteIncomingPaymentService {
  get(
    url: string
  ): Promise<
    OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
  >
  create(
    args: CreateRemoteIncomingPaymentArgs
  ): Promise<
    OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
  >
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
    get: (url) => get(deps, url),
    create: (args) => create(deps, args)
  }
}

async function create(
  deps: ServiceDependencies,
  args: CreateRemoteIncomingPaymentArgs
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  let walletAddress: OpenPaymentsWalletAddress

  try {
    walletAddress = await deps.openPaymentsClient.walletAddress.get({
      url: args.walletAddressUrl
    })
  } catch (err) {
    const errorMessage = 'Could not get wallet address'
    deps.logger.error(
      { err, walletAddressUrl: args.walletAddressUrl },
      errorMessage
    )
    return RemoteIncomingPaymentError.UnknownWalletAddress
  }

  return createIncomingPaymentWithRetry(deps, args, walletAddress)
}

async function createIncomingPaymentWithRetry(
  deps: ServiceDependencies,
  args: CreateRemoteIncomingPaymentArgs,
  walletAddress: WalletAddress,
  retries = 1
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  const resourceServerUrl =
    walletAddress.resourceServer ?? new URL(walletAddress.id).origin

  const grantOptions = {
    authServer: walletAddress.authServer,
    accessType: 'incoming-payment' as const,
    accessActions: [AccessAction.Create, AccessAction.ReadAll]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.create(
      {
        url: resourceServerUrl,
        accessToken: grant.accessToken
      },
      {
        walletAddress: walletAddress.id,
        incomingAmount: args.incomingAmount
          ? serializeAmount(args.incomingAmount)
          : undefined,
        expiresAt: args.expiresAt?.toISOString(),
        metadata: args.metadata ?? undefined
      }
    )
  } catch (err) {
    const errorMessage = 'Error creating remote incoming payment'
    if (err instanceof OpenPaymentsClientError) {
      deps.logger.error(
        {
          errStatus: err.status,
          errDescription: err.description,
          errMessage: err.message,
          errValidation: err.validationErrors,
          walletAddressUrl: walletAddress.id,
          resourceServerUrl
        },
        errorMessage
      )

      // TODO: check for token-specific error codes when resource server is updated to return proper error objects
      if ((err.status === 401 || err.status === 403) && retries > 0) {
        deps.logger.warn(
          { resourceServerUrl, errStatus: err.status },
          `Retrying request after receiving ${err.status} code. Retries left: ${retries}`
        )

        retries--
        await deps.grantService.delete(grant.id) // force new grant creation

        return await createIncomingPaymentWithRetry(
          deps,
          args,
          walletAddress,
          retries
        )
      }
    } else {
      deps.logger.error(
        { err, walletAddressUrl: walletAddress.id },
        errorMessage
      )
    }
    return RemoteIncomingPaymentError.InvalidRequest
  }
}

async function get(
  deps: ServiceDependencies,
  url: string
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  let publicIncomingPayment: PublicIncomingPayment
  try {
    publicIncomingPayment =
      await deps.openPaymentsClient.incomingPayment.getPublic({
        url
      })
  } catch (err) {
    if (err instanceof OpenPaymentsClientError) {
      if (err.status === 404) {
        return RemoteIncomingPaymentError.NotFound
      }
    }

    deps.logger.warn({ url, err }, 'Could not get public incoming payment')
    return RemoteIncomingPaymentError.InvalidRequest
  }

  const grantOptions = {
    authServer: publicIncomingPayment.authServer,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.ReadAll]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.get({
      url,
      accessToken: grant.accessToken
    })
  } catch (err) {
    if (err instanceof OpenPaymentsClientError) {
      if (err.status === 404) {
        return RemoteIncomingPaymentError.NotFound
      }
    }

    deps.logger.warn({ url, err }, 'Could not get incoming payment')
    return RemoteIncomingPaymentError.InvalidRequest
  }
}
