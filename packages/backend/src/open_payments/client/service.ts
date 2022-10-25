import { Counter, ResolvedPayment } from '@interledger/pay'
import { createMockContext } from '@shopify/jest-koa-mocks'
import axios, { AxiosRequestHeaders, AxiosResponse } from 'axios'
import base64url from 'base64url'
import { OpenAPI, HttpMethod, ValidateFunction } from 'openapi'
import { URL } from 'url'

import { Amount, parseAmount } from '../amount'
import { ConnectionRoutes } from '../connection/routes'
import { ConnectionBase, ConnectionJSON } from '../connection/service'
import { IncomingPaymentJSON } from '../payment/incoming/model'
import { IncomingPaymentRoutes } from '../payment/incoming/routes'
import { PaymentPointerService } from '../payment_pointer/service'
import { ReadContext } from '../../app'
import { AssetOptions } from '../../asset/service'
import { BaseService } from '../../shared/baseService'

const REQUEST_TIMEOUT = 5_000 // millseconds

export class Receiver extends ConnectionBase {
  static fromConnection(connection: ConnectionJSON): Receiver {
    return new this(connection)
  }

  static fromIncomingPayment(
    incomingPayment: IncomingPaymentJSON
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

export interface OpenPaymentsClientService {
  receiver: {
    get(url: string): Promise<Receiver | undefined>
  }
}

interface ServiceDependencies extends BaseService {
  accessToken: string
  connectionRoutes: ConnectionRoutes
  incomingPaymentRoutes: IncomingPaymentRoutes
  openApi: OpenAPI
  openPaymentsUrl: string
  paymentPointerService: PaymentPointerService
  validateConnection: ValidateFunction<ConnectionJSON>
  validateIncomingPayment: ValidateFunction<IncomingPaymentJSON>
}

export async function createOpenPaymentsClientService(
  deps_: Omit<
    ServiceDependencies,
    'validateConnection' | 'validateIncomingPayment'
  >
): Promise<OpenPaymentsClientService> {
  const log = deps_.logger.child({
    service: 'OpenPaymentsClientService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log,
    validateConnection: deps_.openApi.createResponseValidator<ConnectionJSON>({
      path: '/connections/{id}',
      method: HttpMethod.GET
    }),
    validateIncomingPayment:
      deps_.openApi.createResponseValidator<IncomingPaymentJSON>({
        path: '/incoming-payments/{id}',
        method: HttpMethod.GET
      })
  }
  return {
    receiver: {
      get: (url) => getReceiver(deps, url)
    }
  }
}

async function getResource({
  url,
  accessToken,
  expectedStatus = 200
}: {
  url: string
  accessToken?: string
  expectedStatus?: number
}): Promise<AxiosResponse> {
  const requestUrl = new URL(url)
  if (process.env.NODE_ENV === 'development') {
    requestUrl.protocol = 'http'
  }
  const headers: AxiosRequestHeaders = {
    'Content-Type': 'application/json'
  }
  if (accessToken) {
    headers['Authorization'] = `GNAP ${accessToken}`
    // TODO: https://github.com/interledger/rafiki/issues/587
    headers['Signature'] = 'TODO'
    headers['Signature-Input'] = 'TODO'
  }
  return await axios.get(requestUrl.href, {
    headers,
    timeout: REQUEST_TIMEOUT,
    validateStatus: (status) => status === expectedStatus
  })
}

const createReadContext = (params: { id: string }): ReadContext =>
  createMockContext({
    headers: { Accept: 'application/json' },
    method: 'GET',
    customProperties: {
      params
    }
  }) as ReadContext

async function getConnection(
  deps: ServiceDependencies,
  url: string
): Promise<ConnectionJSON | undefined> {
  try {
    // Check if this is a local incoming payment connection
    if (url.startsWith(`${deps.openPaymentsUrl}/connections/`)) {
      const ctx = createReadContext({
        id: url.slice(-36)
      })
      await deps.connectionRoutes.get(ctx)
      return ctx.body as ConnectionJSON
    }
    const { status, data } = await getResource({
      url
    })
    if (
      !deps.validateConnection({
        status,
        body: data
      })
    ) {
      throw new Error('unreachable')
    }
    return data
  } catch (_) {
    return undefined
  }
}

const INCOMING_PAYMENT_URL_REGEX =
  /(?<paymentPointerUrl>^(.)+)\/incoming-payments\/(?<id>(.){36}$)/

async function getIncomingPayment(
  deps: ServiceDependencies,
  url: string
): Promise<IncomingPaymentJSON | undefined> {
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
      const ctx = createReadContext({
        id: match.id
      })
      ctx.paymentPointer = paymentPointer
      await deps.incomingPaymentRoutes.get(ctx)
      return ctx.body as IncomingPaymentJSON
    }
    const { status, data } = await getResource({
      url,
      accessToken: deps.accessToken
    })
    if (
      !deps.validateIncomingPayment({
        status,
        body: data
      }) ||
      !isValidIncomingPayment(data)
    ) {
      throw new Error('unreachable')
    }
    return data
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
  payment: IncomingPaymentJSON
): payment is IncomingPaymentJSON {
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
