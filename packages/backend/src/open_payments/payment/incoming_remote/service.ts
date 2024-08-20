import {
  AuthenticatedClient,
  IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethods,
  AccessAction,
  WalletAddress as OpenPaymentsWalletAddress
} from '@interledger/open-payments'
import { Grant } from '../../grant/model'
import { GrantService } from '../../grant/service'
import { BaseService } from '../../../shared/baseService'
import { Amount, serializeAmount } from '../../amount'
import {
  isRemoteIncomingPaymentError,
  RemoteIncomingPaymentError
} from './errors'
import { isGrantError } from '../../grant/errors'

interface CreateRemoteIncomingPaymentArgs {
  walletAddressUrl: string
  expiresAt?: Date
  incomingAmount?: Amount
  metadata?: Record<string, unknown>
}

export interface RemoteIncomingPaymentService {
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
    create: (args) => create(deps, args)
  }
}

async function create(
  deps: ServiceDependencies,
  args: CreateRemoteIncomingPaymentArgs
): Promise<
  OpenPaymentsIncomingPaymentWithPaymentMethods | RemoteIncomingPaymentError
> {
  const { walletAddressUrl } = args
  const grantOrError = await getGrant(deps, walletAddressUrl, [
    AccessAction.Create,
    AccessAction.ReadAll
  ])

  if (isRemoteIncomingPaymentError(grantOrError)) {
    return grantOrError
  }

  try {
    const url = new URL(walletAddressUrl)
    return await deps.openPaymentsClient.incomingPayment.create(
      {
        url: url.origin,
        accessToken: grantOrError.accessToken
      },
      {
        walletAddress: walletAddressUrl,
        incomingAmount: args.incomingAmount
          ? serializeAmount(args.incomingAmount)
          : undefined,
        expiresAt: args.expiresAt?.toISOString(),
        metadata: args.metadata ?? undefined
      }
    )
  } catch (err) {
    const errorMessage = 'Error creating remote incoming payment'
    deps.logger.error({ err, walletAddressUrl }, errorMessage)
    return RemoteIncomingPaymentError.InvalidRequest
  }
}

async function getGrant(
  deps: ServiceDependencies,
  walletAddressUrl: string,
  accessActions: AccessAction[]
): Promise<Grant | RemoteIncomingPaymentError> {
  let walletAddress: OpenPaymentsWalletAddress

  try {
    walletAddress = await deps.openPaymentsClient.walletAddress.get({
      url: walletAddressUrl
    })
  } catch (err) {
    const errorMessage = 'Could not get wallet address'
    deps.logger.error({ err, walletAddressUrl }, errorMessage)
    return RemoteIncomingPaymentError.UnknownWalletAddress
  }

  const grantOptions = {
    authServer: walletAddress.authServer,
    accessType: 'incoming-payment' as const,
    accessActions
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return RemoteIncomingPaymentError.InvalidGrant
  }

  return grant
}
