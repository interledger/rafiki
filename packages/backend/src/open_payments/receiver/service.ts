import {
  AuthenticatedClient,
  IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethods,
  AccessType,
  AccessAction,
  PublicIncomingPayment
} from '@interledger/open-payments'
import { StreamCredentialsService } from '../../payment-method/ilp/stream-credentials/service'
import { Grant } from '../grant/model'
import { GrantService } from '../grant/service'
import { WalletAddressService } from '../wallet_address/service'
import { BaseService } from '../../shared/baseService'
import { IncomingPaymentService } from '../payment/incoming/service'
import { WalletAddress } from '../wallet_address/model'
import { Receiver } from './model'
import { Amount } from '../amount'
import { RemoteIncomingPaymentService } from '../payment/incoming_remote/service'
import { isIncomingPaymentError } from '../payment/incoming/errors'
import {
  isReceiverError,
  ReceiverError,
  errorToMessage as receiverErrorToMessage
} from './errors'
import { IAppConfig } from '../../config/app'
import { isGrantError } from '../grant/errors'

interface CreateReceiverArgs {
  walletAddressUrl: string
  expiresAt?: Date
  incomingAmount?: Amount
  metadata?: Record<string, unknown>
}

// A receiver is resolved from an incoming payment
export interface ReceiverService {
  get(url: string): Promise<Receiver | undefined>
  create(args: CreateReceiverArgs): Promise<Receiver | ReceiverError>
}

interface ServiceDependencies extends BaseService {
  streamCredentialsService: StreamCredentialsService
  grantService: GrantService
  incomingPaymentService: IncomingPaymentService
  openPaymentsUrl: string
  walletAddressService: WalletAddressService
  openPaymentsClient: AuthenticatedClient
  remoteIncomingPaymentService: RemoteIncomingPaymentService
  config: IAppConfig
}

const INCOMING_PAYMENT_URL_REGEX =
  /(?<resourceServerUrl>^(.)+)\/incoming-payments\/(?<id>(.){36}$)/

export async function createReceiverService(
  deps_: ServiceDependencies
): Promise<ReceiverService> {
  const log = deps_.logger.child({
    service: 'ReceiverService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }

  return {
    get: (url) => getReceiver(deps, url),
    create: (url) => createReceiver(deps, url)
  }
}

async function createReceiver(
  deps: ServiceDependencies,
  args: CreateReceiverArgs
): Promise<Receiver | ReceiverError> {
  const localWalletAddress = await deps.walletAddressService.getByUrl(
    args.walletAddressUrl
  )

  const incomingPaymentOrError = localWalletAddress
    ? await createLocalIncomingPayment(deps, args, localWalletAddress)
    : await deps.remoteIncomingPaymentService.create(args)

  if (isReceiverError(incomingPaymentOrError)) {
    return incomingPaymentOrError
  }

  try {
    return new Receiver(incomingPaymentOrError)
  } catch (error) {
    const errorMessage = 'Could not create receiver from incoming payment'
    deps.logger.error(
      {
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Unknown error'
      },
      errorMessage
    )

    throw new Error(errorMessage, { cause: error })
  }
}

async function createLocalIncomingPayment(
  deps: ServiceDependencies,
  args: CreateReceiverArgs,
  walletAddress: WalletAddress
): Promise<OpenPaymentsIncomingPaymentWithPaymentMethods | ReceiverError> {
  const { expiresAt, incomingAmount, metadata } = args

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    walletAddressId: walletAddress.id,
    expiresAt,
    incomingAmount,
    metadata
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    const errorMessage = 'Could not create local incoming payment'
    deps.logger.error(
      { error: receiverErrorToMessage(incomingPaymentOrError) },
      errorMessage
    )

    return incomingPaymentOrError
  }

  const streamCredentials = deps.streamCredentialsService.get(
    incomingPaymentOrError
  )

  if (!streamCredentials) {
    const errorMessage =
      'Could not get stream credentials for local incoming payment'
    deps.logger.error({ err: incomingPaymentOrError }, errorMessage)

    throw new Error(errorMessage)
  }

  return incomingPaymentOrError.toOpenPaymentsTypeWithMethods(
    walletAddress,
    streamCredentials
  )
}

async function getReceiver(
  deps: ServiceDependencies,
  url: string
): Promise<Receiver | undefined> {
  const urlParseResult = parseIncomingPaymentUrl(url)
  if (!urlParseResult) {
    deps.logger.info({ url }, 'Could not parse incoming payment url')
    return undefined
  }

  const incomingPayment =
    (await getLocalIncomingPayment(deps, urlParseResult.id)) ??
    (await getRemoteIncomingPayment(deps, url))

  if (incomingPayment) {
    return new Receiver(incomingPayment)
  }
}

function parseIncomingPaymentUrl(
  url: string
): { id: string; resourceServerUrl: string } | undefined {
  const match = url.match(INCOMING_PAYMENT_URL_REGEX)?.groups
  if (!match || !match.resourceServerUrl || !match.id) {
    return undefined
  }

  return {
    id: match.id,
    resourceServerUrl: match.resourceServerUrl
  }
}

async function getLocalIncomingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OpenPaymentsIncomingPaymentWithPaymentMethods | undefined> {
  const incomingPayment = await deps.incomingPaymentService.get({
    id
  })

  if (!incomingPayment || !incomingPayment.walletAddress) {
    return undefined
  }

  const streamCredentials = deps.streamCredentialsService.get(incomingPayment)

  if (!streamCredentials) {
    return undefined
  }

  return incomingPayment.toOpenPaymentsTypeWithMethods(
    incomingPayment.walletAddress,
    streamCredentials
  )
}

async function getRemoteIncomingPayment(
  deps: ServiceDependencies,
  url: string
) {
  const grant = await getIncomingPaymentGrant(deps, url)
  if (!grant) {
    return undefined
  }

  try {
    return await deps.openPaymentsClient.incomingPayment.get({
      url,
      accessToken: grant.accessToken
    })
  } catch (error) {
    deps.logger.error(
      { errorMessage: error instanceof Error && error.message },
      'Could not get incoming payment'
    )
    return undefined
  }
}

async function getIncomingPaymentGrant(
  deps: ServiceDependencies,
  incomingPaymentUrl: string
): Promise<Grant | undefined> {
  let publicIncomingPayment: PublicIncomingPayment

  try {
    publicIncomingPayment =
      await deps.openPaymentsClient.incomingPayment.getPublic({
        url: incomingPaymentUrl
      })
  } catch (err) {
    deps.logger.info(
      { incomingPaymentUrl, err },
      'Could not fetch public incoming payment'
    )
    return undefined
  }

  const grantOptions = {
    authServer: publicIncomingPayment.authServer,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.ReadAll]
  }

  const grant = await deps.grantService.getOrCreate(grantOptions)

  if (isGrantError(grant)) {
    return undefined
  }

  return grant
}
