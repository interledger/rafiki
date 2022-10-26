import { Counter, ResolvedPayment } from '@interledger/pay'
import base64url from 'base64url'

import { Amount, parseAmount } from '../amount'

import {
  ConnectionBase,
  ConnectionJSON,
  ConnectionService
} from '../connection/service'
import { IncomingPaymentJSON } from '../payment/incoming/model'
import { PaymentPointerService } from '../payment_pointer/service'
import { ReadContext } from '../../app'
import { AssetOptions } from '../../asset/service'
import { BaseService } from '../../shared/baseService'

import {
  OpenPaymentsClient,
  IncomingPayment,
  ILPStreamConnection
} from 'open-payments'
import { IncomingPaymentService } from '../payment/incoming/service'
import { PaymentPointer } from '../payment_pointer/model'

export class Receiver extends ConnectionBase {
  static fromConnection(connection: ConnectionJSON): Receiver {
    return new this(connection)
  }

  static fromIncomingPayment(
    incomingPayment: IncomingPayment
  ): Receiver | undefined {
    if (incomingPayment.completed) {
      return undefined
    }
    if (typeof incomingPayment.ilpStreamConnection !== 'object') {
      return undefined
    }
    if (
      incomingPayment.expiresAt &&
      new Date(incomingPayment.expiresAt).getTime() <= Date.now()
    ) {
      return undefined
    }
    const receivedAmount = parseAmount(incomingPayment.receivedAmount)
    const incomingAmount = incomingPayment.incomingAmount
      ? parseAmount(incomingPayment.incomingAmount)
      : undefined

    return new this(
      incomingPayment.ilpStreamConnection,
      incomingAmount?.value,
      receivedAmount.value
    )
  }

  private constructor(
    connection: ConnectionJSON,
    private readonly incomingAmountValue?: bigint,
    private readonly receivedAmountValue?: bigint
  ) {
    super(
      connection.ilpAddress,
      base64url.toBuffer(connection.sharedSecret),
      connection.assetCode,
      connection.assetScale
    )
  }

  public get asset(): AssetOptions {
    return {
      code: this.assetCode,
      scale: this.assetScale
    }
  }

  public get incomingAmount(): Amount | undefined {
    if (this.incomingAmountValue) {
      return {
        value: this.incomingAmountValue,
        assetCode: this.assetCode,
        assetScale: this.assetScale
      }
    }
    return undefined
  }

  public get receivedAmount(): Amount | undefined {
    if (this.receivedAmountValue !== undefined) {
      return {
        value: this.receivedAmountValue,
        assetCode: this.assetCode,
        assetScale: this.assetScale
      }
    }
    return undefined
  }

  public toResolvedPayment(): ResolvedPayment {
    return {
      destinationAsset: this.asset,
      destinationAddress: this.ilpAddress,
      sharedSecret: this.sharedSecret,
      requestCounter: Counter.from(0)
    }
  }
}

export interface ReceiverService {
  receiver: {
    get(url: string): Promise<Receiver | undefined>
  }
}

interface ServiceDependencies extends BaseService {
  accessToken: string
  connectionService: ConnectionService
  incomingPaymentService: IncomingPaymentService
  openPaymentsUrl: string
  paymentPointerService: PaymentPointerService
  openPaymentsClient: OpenPaymentsClient
}

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
    receiver: {
      get: (url) => getReceiver(deps, url)
    }
  }
}

async function getLocalConnection(
  deps: ServiceDependencies,
  url: string
): Promise<ILPStreamConnection | undefined> {
  const incomingPayment = await deps.incomingPaymentService.getByConnection(
    url.slice(-36)
  )

  if (!incomingPayment) {
    return
  }

  const connection = deps.connectionService.get(incomingPayment)

  return connection ? connection.toJSON() : undefined
}

async function getConnection(
  deps: ServiceDependencies,
  url: string
): Promise<ILPStreamConnection | undefined> {
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

const INCOMING_PAYMENT_URL_REGEX =
  /(?<paymentPointerUrl>^(.)+)\/incoming-payments\/(?<id>(.){36}$)/

async function getLocalIncomingPayment({
  deps,
  id,
  paymentPointer
}: {
  deps: ServiceDependencies
  id: string
  paymentPointer: PaymentPointer
}): Promise<IncomingPayment> {
  const incomingPayment = await deps.incomingPaymentService.get({
    id,
    paymentPointerId: paymentPointer.id
  })

  const connection = deps.connectionService.get(incomingPayment)

  return {
    ...incomingPayment.toJSON(),
    ilpStreamConnection: connection.toJSON()
  }
}

async function getIncomingPayment(
  deps: ServiceDependencies,
  url: string
): Promise<IncomingPayment | undefined> {
  try {
    const match = url.match(INCOMING_PAYMENT_URL_REGEX)?.groups
    if (!match) {
      return undefined
    }
    // Check if this is a local payment pointer
    const paymentPointer = await deps.paymentPointerService.getByUrl(
      match.paymentPointerUrl
    )
    if (paymentPointer) {
      const incoming
      await deps.incomingPaymentRoutes.get(ctx)
      return ctx.body as IncomingPaymentJSON
    }
    const incomingPayment = await deps.openPaymentsClient.incomingPayment.get({
      url,
      accessToken: deps.accessToken
    })
    if (!isValidIncomingPayment(incomingPayment)) {
      throw new Error('unreachable')
    }

    return incomingPayment
  } catch (_) {
    return undefined
  }
}

const CONNECTION_URL_REGEX = /\/connections\/(.){36}$/

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

// Validate referential integrity, which cannot be represented in OpenAPI
function isValidIncomingPayment(
  payment: IncomingPayment
): payment is IncomingPayment {
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
