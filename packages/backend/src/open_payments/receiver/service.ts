import {
  AuthenticatedClient,
  IncomingPayment as OpenPaymentsIncomingPayment,
  ILPStreamConnection as OpenPaymentsConnection,
  isNonInteractiveGrant,
  AccessType,
  AccessAction
} from 'open-payments'
import { ConnectionService } from '../connection/service'
import { Grant } from '../grant/model'
import { GrantService } from '../grant/service'
import { PaymentPointerService } from '../payment_pointer/service'
import { BaseService } from '../../shared/baseService'
import { IncomingPaymentService } from '../payment/incoming/service'
import { PaymentPointer } from '../payment_pointer/model'
import { Receiver } from './model'
import { Amount } from '../amount'
import { RemoteIncomingPaymentService } from '../payment/incoming_remote/service'
import { isIncomingPaymentError } from '../payment/incoming/errors'
import {
  isReceiverError,
  ReceiverError,
  errorToMessage as receiverErrorToMessage
} from './errors'

interface CreateReceiverArgs {
  paymentPointerUrl: string
  description?: string
  expiresAt?: Date
  incomingAmount?: Amount
  externalRef?: string
}

// A receiver is resolved from an incoming payment or a connection
export interface ReceiverService {
  get(url: string): Promise<Receiver | undefined>
  create(args: CreateReceiverArgs): Promise<Receiver | ReceiverError>
}

interface ServiceDependencies extends BaseService {
  connectionService: ConnectionService
  grantService: GrantService
  incomingPaymentService: IncomingPaymentService
  openPaymentsUrl: string
  paymentPointerService: PaymentPointerService
  openPaymentsClient: AuthenticatedClient
  remoteIncomingPaymentService: RemoteIncomingPaymentService
}

const CONNECTION_URL_REGEX = /\/connections\/(.){36}$/
const INCOMING_PAYMENT_URL_REGEX =
  /(?<paymentPointerUrl>^(.)+)\/incoming-payments\/(?<id>(.){36}$)/

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
  const localPaymentPointer = await deps.paymentPointerService.getByUrl(
    args.paymentPointerUrl
  )

  const incomingPaymentOrError = localPaymentPointer
    ? await createLocalIncomingPayment(deps, args, localPaymentPointer)
    : await deps.remoteIncomingPaymentService.create(args)

  if (isReceiverError(incomingPaymentOrError)) {
    return incomingPaymentOrError
  }

  try {
    return Receiver.fromIncomingPayment(incomingPaymentOrError)
  } catch (error) {
    const errorMessage = 'Could not create receiver from incoming payment'
    deps.logger.error(
      { error: error && error['message'] ? error['message'] : 'Unknown error' },
      errorMessage
    )

    throw new Error(errorMessage, { cause: error })
  }
}

async function createLocalIncomingPayment(
  deps: ServiceDependencies,
  args: CreateReceiverArgs,
  paymentPointer: PaymentPointer
): Promise<OpenPaymentsIncomingPayment | ReceiverError> {
  const { description, expiresAt, incomingAmount, externalRef } = args

  const incomingPaymentOrError = await deps.incomingPaymentService.create({
    paymentPointerId: paymentPointer.id,
    description,
    expiresAt,
    incomingAmount,
    externalRef
  })

  if (isIncomingPaymentError(incomingPaymentOrError)) {
    const errorMessage = 'Could not create local incoming payment'
    deps.logger.error(
      { error: receiverErrorToMessage(incomingPaymentOrError) },
      errorMessage
    )

    return incomingPaymentOrError
  }

  const connection = deps.connectionService.get(incomingPaymentOrError)

  if (!connection) {
    const errorMessage = 'Could not get connection for local incoming payment'
    deps.logger.error({ incomingPaymentOrError }, errorMessage)

    throw new Error(errorMessage)
  }

  return incomingPaymentOrError.toOpenPaymentsType(paymentPointer, connection)
}

async function getReceiver(
  deps: ServiceDependencies,
  url: string
): Promise<Receiver | undefined> {
  if (url.match(CONNECTION_URL_REGEX)) {
    const connection = await getConnection(deps, url)
    if (connection) {
      return Receiver.fromConnection(connection)
    }
  } else {
    const incomingPayment = await getIncomingPayment(deps, url)
    if (incomingPayment) {
      return Receiver.fromIncomingPayment(incomingPayment)
    }
  }
}

async function getLocalConnection(
  deps: ServiceDependencies,
  url: string
): Promise<OpenPaymentsConnection | undefined> {
  const incomingPayment = await deps.incomingPaymentService.getByConnection(
    url.slice(-36)
  )

  if (!incomingPayment) {
    return
  }

  const connection = deps.connectionService.get(incomingPayment)

  if (!connection) {
    return
  }

  return connection.toOpenPaymentsType()
}

async function getConnection(
  deps: ServiceDependencies,
  url: string
): Promise<OpenPaymentsConnection | undefined> {
  try {
    if (url.startsWith(`${deps.openPaymentsUrl}/connections/`)) {
      return await getLocalConnection(deps, url)
    }

    return await deps.openPaymentsClient.ilpStreamConnection.get({
      url
    })
  } catch (error) {
    deps.logger.error(
      { errorMessage: error && error['message'] },
      'Could not get connection'
    )

    return undefined
  }
}

function parseIncomingPaymentUrl(
  url: string
): { id: string; paymentPointerUrl: string } | undefined {
  const match = url.match(INCOMING_PAYMENT_URL_REGEX)?.groups
  if (!match || !match.paymentPointerUrl || !match.id) {
    return undefined
  }

  return {
    id: match.id,
    paymentPointerUrl: match.paymentPointerUrl
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  url: string
): Promise<OpenPaymentsIncomingPayment | undefined> {
  try {
    const urlParseResult = parseIncomingPaymentUrl(url)
    if (!urlParseResult) {
      return undefined
    }
    // Check if this is a local payment pointer
    const paymentPointer = await deps.paymentPointerService.getByUrl(
      urlParseResult.paymentPointerUrl
    )
    if (paymentPointer) {
      return await getLocalIncomingPayment({
        deps,
        id: urlParseResult.id,
        paymentPointer
      })
    }

    const grant = await getIncomingPaymentGrant(
      deps,
      urlParseResult.paymentPointerUrl
    )
    if (!grant) {
      throw new Error('Could not find grant')
    } else {
      return await deps.openPaymentsClient.incomingPayment.get({
        url,
        accessToken: grant.accessToken
      })
    }
  } catch (error) {
    deps.logger.error(
      { errorMessage: error && error['message'] },
      'Could not get incoming payment'
    )
    return undefined
  }
}

async function getLocalIncomingPayment({
  deps,
  id,
  paymentPointer
}: {
  deps: ServiceDependencies
  id: string
  paymentPointer: PaymentPointer
}): Promise<OpenPaymentsIncomingPayment | undefined> {
  const incomingPayment = await deps.incomingPaymentService.get({
    id,
    paymentPointerId: paymentPointer.id
  })

  if (!incomingPayment) {
    return undefined
  }

  const connection = deps.connectionService.get(incomingPayment)

  if (!connection) {
    return undefined
  }

  return incomingPayment.toOpenPaymentsType(paymentPointer, connection)
}

async function getIncomingPaymentGrant(
  deps: ServiceDependencies,
  paymentPointerUrl: string
): Promise<Grant | undefined> {
  const paymentPointer = await deps.openPaymentsClient.paymentPointer.get({
    url: paymentPointerUrl
  })
  if (!paymentPointer) {
    return undefined
  }
  const grantOptions = {
    authServer: paymentPointer.authServer,
    accessType: AccessType.IncomingPayment,
    accessActions: [AccessAction.ReadAll]
  }

  const existingGrant = await deps.grantService.get(grantOptions)
  if (existingGrant) {
    if (existingGrant.expired) {
      if (!existingGrant.authServer) {
        deps.logger.warn('Unknown auth server.')
        return undefined
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
        deps.logger.warn({ err }, 'Grant token rotation failed.')
        return undefined
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
    try {
      return await deps.grantService.create({
        ...grantOptions,
        accessToken: grant.access_token.value,
        managementUrl: grant.access_token.manage,
        expiresIn: grant.access_token.expires_in
      })
    } catch (err) {
      deps.logger.warn({ grantOptions }, 'Grant has wrong format')
      return undefined
    }
  }
  deps.logger.warn({ grantOptions }, 'Grant request required interaction')
  return undefined
}
