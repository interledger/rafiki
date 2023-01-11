import {
  AuthenticatedClient,
  IncomingPayment as OpenPaymentsIncomingPayment,
  ILPStreamConnection as OpenPaymentsConnection,
  isNonInteractiveGrant
} from 'open-payments'

import { AccessAction, AccessType } from '../auth/grant'
import { ConnectionService } from '../connection/service'
import { Grant } from '../grant/model'
import { GrantService } from '../grant/service'
import { PaymentPointerService } from '../payment_pointer/service'
import { BaseService } from '../../shared/baseService'
import { IncomingPaymentService } from '../payment/incoming/service'
import { PaymentPointer } from '../payment_pointer/model'
import { Receiver } from './model'

// A receiver is resolved from an incoming payment or a connection
export interface ReceiverService {
  get(url: string): Promise<Receiver | undefined>
}

interface ServiceDependencies extends BaseService {
  connectionService: ConnectionService
  grantService: GrantService
  incomingPaymentService: IncomingPaymentService
  openPaymentsUrl: string
  paymentPointerService: PaymentPointerService
  openPaymentsClient: AuthenticatedClient
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
    get: (url) => getReceiver(deps, url)
  }
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
        accessToken: grant.accessToken || ''
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

  return incomingPayment.toOpenPaymentsType({ ilpStreamConnection: connection })
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
      // TODO
      // https://github.com/interledger/rafiki/issues/795
      deps.logger.warn({ grantOptions }, 'Grant access token expired')
      return undefined
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
    return await deps.grantService.create({
      ...grantOptions,
      accessToken: grant.access_token.value,
      expiresIn: grant.access_token.expires_in
    })
  }
  deps.logger.warn({ grantOptions }, 'Grant request required interaction')
  return undefined
}
