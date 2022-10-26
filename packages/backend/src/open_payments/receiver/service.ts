import {
  OpenPaymentsClient,
  IncomingPayment as OpenPaymentsIncomingPayment,
  ILPStreamConnection as OpenPaymentsConnection
} from 'open-payments'

import { parseAmount } from '../amount'
import { ConnectionService } from '../connection/service'
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
  accessToken: string
  connectionService: ConnectionService
  incomingPaymentService: IncomingPaymentService
  openPaymentsUrl: string
  paymentPointerService: PaymentPointerService
  openPaymentsClient: OpenPaymentsClient
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
      url,
      accessToken: deps.accessToken
    })
  } catch (_) {
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

    const incomingPayment = await deps.openPaymentsClient.incomingPayment.get({
      url,
      accessToken: deps.accessToken
    })
    if (!isValidIncomingPayment(incomingPayment)) {
      throw new Error('Invalid incoming payment')
    }

    return incomingPayment
  } catch (_) {
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
}): Promise<OpenPaymentsIncomingPayment> {
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

// Validate referential integrity, which cannot be represented in OpenAPI
function isValidIncomingPayment(
  payment: OpenPaymentsIncomingPayment
): payment is OpenPaymentsIncomingPayment {
  if (payment.incomingAmount) {
    const incomingAmount = parseAmount(payment.incomingAmount)
    const receivedAmount = parseAmount(payment.receivedAmount)
    if (
      incomingAmount.assetCode !== receivedAmount.assetCode ||
      incomingAmount.assetScale !== receivedAmount.assetScale
    ) {
      return false
    }
    if (incomingAmount.value < receivedAmount.value) {
      return false
    }
    if (incomingAmount.value === receivedAmount.value && !payment.completed) {
      return false
    }
  }
  if (typeof payment.ilpStreamConnection === 'object') {
    if (
      payment.ilpStreamConnection.assetCode !==
        payment.receivedAmount.assetCode ||
      payment.ilpStreamConnection.assetScale !==
        payment.receivedAmount.assetScale
    ) {
      return false
    }
  }
  return true
}
