import {
  AuthenticatedClient,
  IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethods,
  IncomingPayment as OpenPaymentsIncomingPayment,
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
import { urlWithoutTenantId } from '../../../shared/utils'

interface CreateRemoteIncomingPaymentArgs {
  walletAddressUrl: string
  expiresAt?: Date
  incomingAmount?: Amount
  metadata?: Record<string, unknown>
}

type OpenPaymentsIncomingPaymentType =
  | OpenPaymentsIncomingPayment
  | OpenPaymentsIncomingPaymentWithPaymentMethods

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
  complete(
    url: string
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
    get: (url) => get(deps, url),
    create: (args) => create(deps, args),
    complete: (url) => complete(deps, url)
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

  return createIncomingPayment(deps, {
    createArgs: args,
    walletAddress
  })
}

async function createIncomingPayment(
  deps: ServiceDependencies,
  {
    createArgs,
    walletAddress,
    retryOnTokenError = true
  }: {
    createArgs: CreateRemoteIncomingPaymentArgs
    walletAddress: WalletAddress
    retryOnTokenError?: boolean
  }
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  const resourceServerUrl =
    walletAddress.resourceServer ?? new URL(walletAddress.id).origin

  const grantOptions = {
    authServer: walletAddress.authServer,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.Create, AccessAction.ReadAll]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.create(
      {
        url: urlWithoutTenantId(resourceServerUrl),
        accessToken: grant.accessToken
      },
      {
        walletAddress: walletAddress.id,
        incomingAmount: createArgs.incomingAmount
          ? serializeAmount(createArgs.incomingAmount)
          : undefined,
        expiresAt: createArgs.expiresAt?.toISOString(),
        metadata: createArgs.metadata ?? undefined
      }
    )
  } catch (err) {
    const errorMessage = 'Error creating remote incoming payment'

    const baseErrorLog = {
      walletAddressUrl: walletAddress.id,
      resourceServerUrl,
      grantId: grant.id
    }

    return handleOpenPaymentsError(
      deps,
      err,
      errorMessage,
      baseErrorLog,
      grant,
      retryOnTokenError,
      () =>
        createIncomingPayment(deps, {
          createArgs,
          walletAddress,
          retryOnTokenError: false
        })
    )
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
    deps.logger.warn({ url, err }, 'Could not get public incoming payment')
    return RemoteIncomingPaymentError.InvalidRequest
  }

  return getIncomingPayment(deps, {
    url,
    authServerUrl: publicIncomingPayment.authServer
  })
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  {
    url,
    authServerUrl,
    retryOnTokenError = true
  }: { url: string; authServerUrl: string; retryOnTokenError?: boolean }
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  const grantOptions = {
    authServer: authServerUrl,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.ReadAll]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }

  try {
    const incomingPayment = await deps.openPaymentsClient.incomingPayment.get({
      url,
      accessToken: grant.accessToken
    })

    return incomingPayment
  } catch (err) {
    const errorMessage = 'Could not get remote incoming payment'

    const baseErrorLog = {
      incomingPaymentUrl: url,
      grantId: grant.id
    }

    return handleOpenPaymentsError(
      deps,
      err,
      errorMessage,
      baseErrorLog,
      grant,
      retryOnTokenError,
      () =>
        getIncomingPayment(deps, {
          url,
          authServerUrl,
          retryOnTokenError: false
        })
    )
  }
}

async function complete(
  deps: ServiceDependencies,
  url: string
): Promise<OpenPaymentsIncomingPayment | RemoteIncomingPaymentError> {
  let publicIncomingPayment: PublicIncomingPayment
  try {
    publicIncomingPayment =
      await deps.openPaymentsClient.incomingPayment.getPublic({
        url
      })

    return completeIncomingPayment(deps, {
      url,
      authServer: publicIncomingPayment.authServer
    })
  } catch (err) {
    deps.logger.warn({ url, err }, 'Could not get public incoming payment')
    return RemoteIncomingPaymentError.InvalidRequest
  }
}

async function completeIncomingPayment(
  deps: ServiceDependencies,
  {
    url,
    authServer,
    retryOnTokenError = true
  }: { url: string; authServer: string; retryOnTokenError?: boolean }
): Promise<OpenPaymentsIncomingPayment | RemoteIncomingPaymentError> {
  const grantOptions = {
    authServer,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.ReadAll, AccessAction.Complete]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }
  try {
    const incomingPayment =
      await deps.openPaymentsClient.incomingPayment.complete({
        url,
        accessToken: grant.accessToken
      })
    return incomingPayment
  } catch (err) {
    const errorMessage = 'Could not complete remote incoming payment'
    const baseErrorLog = {
      incomingPaymentUrl: url,
      grantId: grant.id
    }
    return handleOpenPaymentsError(
      deps,
      err,
      errorMessage,
      baseErrorLog,
      grant,
      retryOnTokenError,
      () =>
        completeIncomingPayment(deps, {
          url,
          authServer,
          retryOnTokenError: false
        })
    )
  }
}

async function handleOpenPaymentsError<
  T extends OpenPaymentsIncomingPaymentType
>(
  deps: ServiceDependencies,
  err: unknown,
  errorMessage: string,
  baseErrorLog: object,
  grant: { id: string; accessToken: string },
  retryOnTokenError: boolean,
  retryFn: () => Promise<T | RemoteIncomingPaymentError>
): Promise<T | RemoteIncomingPaymentError> {
  if (err instanceof OpenPaymentsClientError) {
    if ((err.status === 401 || err.status === 403) && retryOnTokenError) {
      deps.logger.warn(
        {
          ...baseErrorLog,
          errStatus: err.status,
          errCode: err.code,
          errDescription: err.description
        },
        `Retrying request after receiving ${err.status} error code`
      )

      await deps.grantService.delete(grant.id) // force new grant creation
      return retryFn()
    }

    deps.logger.error(
      {
        ...baseErrorLog,
        errStatus: err.status,
        errCode: err.code,
        errDescription: err.description,
        errMessage: err.message,
        errValidation: err.validationErrors
      },
      errorMessage
    )
    if (err.status === 404) {
      return RemoteIncomingPaymentError.NotFound
    }
  } else {
    deps.logger.error({ ...baseErrorLog, err }, errorMessage)
  }
  return RemoteIncomingPaymentError.InvalidRequest
}
