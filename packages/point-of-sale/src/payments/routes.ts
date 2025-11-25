import { ParsedUrlQuery } from 'querystring'
import { AppContext } from '../app'
import { CardServiceClient, Result } from '../card-service-client/client'
import { BaseService } from '../shared/baseService'
import { PaymentService } from './service'
import { Deferred } from '../utils/deferred'
import { webhookWaitMap } from '../webhook-handlers/request-map'
import { WebhookBody } from '../webhook-handlers/routes'
import { IAppConfig } from '../config/app'
import {
  IncomingPaymentEventTimeoutError,
  InvalidCardPaymentError
} from './errors'
import {
  IncomingPaymentConnection,
  SortOrder,
  Amount as GqlAmount,
  IncomingPayment,
  IncomingPaymentEdge,
  PageInfo,
  IncomingPaymentFilter
} from '../graphql/generated/graphql'

interface ServiceDependencies extends BaseService {
  config: IAppConfig
  paymentService: PaymentService
  cardServiceClient: CardServiceClient
}

interface Amount {
  value: string
  assetScale: number
  assetCode: string
}

export interface PaymentRequestBody {
  signature: string
  payload: string
  amount: Amount
  senderWalletAddress: string
  receiverWalletAddress: string
  timestamp: number
}

type PaymentRequest = Exclude<AppContext['request'], 'body'> & {
  body: PaymentRequestBody
}

export type PaymentContext = Exclude<AppContext, 'request'> & {
  request: PaymentRequest
}

export interface GetPaymentsQuery {
  receiverWalletAddress: string
  sortOrder?: SortOrder
  first?: number
  last?: number
  before?: string
  after?: string
  filter?: IncomingPaymentFilter
}

export type GetPaymentsRequest = Exclude<AppContext['request'], 'query'> & {
  query: ParsedUrlQuery & GetPaymentsQuery
}

export type GetPaymentsContext = Exclude<AppContext, 'request'> & {
  request: GetPaymentsRequest
}

export interface RefundRequestBody {
  incomingPaymentId: string
  posWalletAddress: string
}

export type RefundRequest = Exclude<AppContext['request'], 'body'> & {
  body: RefundRequestBody
}

export type RefundContext = Exclude<AppContext, ['request']> & {
  request: RefundRequest
}

export interface PaymentRoutes {
  getPayments(ctx: GetPaymentsContext): Promise<void>
  payment(ctx: PaymentContext): Promise<void>
  refundPayment(ctx: RefundContext): Promise<void>
}

export function createPaymentRoutes(deps_: ServiceDependencies): PaymentRoutes {
  const log = deps_.logger.child({
    service: 'PaymentRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    payment: (ctx: PaymentContext) => payment(deps, ctx),
    getPayments: (ctx: GetPaymentsContext) => getPayments(deps, ctx),
    refundPayment: (ctx: RefundContext) => refundPayment(deps, ctx)
  }
}

async function getPayments(
  deps: ServiceDependencies,
  ctx: GetPaymentsContext
): Promise<void> {
  const { first, last, ...restOfQuery } = ctx.request.query
  const options: GetPaymentsQuery = {
    ...restOfQuery,
    filter: { initiatedBy: { in: ['CARD'] } }
  }
  if (first) {
    Object.assign(options, { first: Number(first) })
  }
  if (last) {
    Object.assign(options, { last: Number(last) })
  }
  const incomingPaymentsPage =
    await deps.paymentService.getIncomingPayments(options)

  ctx.body = incomingPaymentPageToResponse(incomingPaymentsPage)
}

async function payment(
  deps: ServiceDependencies,
  ctx: PaymentContext
): Promise<void> {
  const body = ctx.request.body
  let incomingPaymentId: string | undefined
  try {
    const senderWalletAddressUrl = new URL(body.senderWalletAddress)

    if (deps.config.useHttp) {
      senderWalletAddressUrl.protocol = 'http:'
    }

    const senderWalletAddress = await deps.paymentService.getWalletAddress(
      senderWalletAddressUrl.href
    )

    const receiverWalletAddressId =
      await deps.paymentService.getWalletAddressIdByUrl(
        body.receiverWalletAddress
      )

    const incomingPayment = await deps.paymentService.createIncomingPayment({
      walletAddressId: receiverWalletAddressId,
      incomingAmount: {
        assetCode: body.amount.assetCode,
        assetScale: body.amount.assetScale,
        value: BigInt(body.amount.value)
      },
      senderWalletAddress: body.senderWalletAddress
    })
    const deferred = new Deferred<WebhookBody>()
    webhookWaitMap.setWithExpiry(
      incomingPayment.id,
      deferred,
      deps.config.webhookTimeoutMs
    )
    incomingPaymentId = incomingPayment.id
    const result = await deps.cardServiceClient.sendPayment(
      senderWalletAddress.cardService,
      {
        signature: body.signature,
        payload: body.payload,
        amount: body.amount,
        senderWalletAddress: body.senderWalletAddress,
        incomingPaymentUrl: incomingPayment.url,
        timestamp: body.timestamp
      }
    )

    if (result === Result.INVALID_SIGNATURE) {
      ctx.body = { result: { code: Result.INVALID_SIGNATURE } }
      ctx.status = 200
      return
    }

    if (result !== Result.APPROVED) throw new InvalidCardPaymentError(result)
    const event = await waitForIncomingPaymentEvent(deps.config, deferred)
    if (!event || !event.data.completed)
      throw new IncomingPaymentEventTimeoutError(incomingPayment.id)
    ctx.body = { result: { code: Result.APPROVED } }
    ctx.status = 200
  } catch (err) {
    deps.logger.debug(err)
    const { body, status } = handlePaymentError(err)
    ctx.body = body
    ctx.status = status
  } finally {
    if (incomingPaymentId) {
      webhookWaitMap.delete(incomingPaymentId)
    }
  }
}

async function refundPayment(
  deps: ServiceDependencies,
  ctx: RefundContext
): Promise<void> {
  const { incomingPaymentId, posWalletAddress } = ctx.request.body
  try {
    await deps.paymentService.refundIncomingPayment(
      incomingPaymentId,
      posWalletAddress
    )
    ctx.status = 200
    return
  } catch (err) {
    ctx.status = 400
    ctx.body = (err as Error).message
    return
  }
}

async function waitForIncomingPaymentEvent(
  config: IAppConfig,
  deferred: Deferred<WebhookBody>
): Promise<WebhookBody | void> {
  return Promise.race([
    deferred.promise,
    new Promise<void>((resolve) =>
      setTimeout(() => resolve(), config.webhookTimeoutMs)
    )
  ])
}

function handlePaymentError(_err: unknown) {
  return { body: { error: { code: 'invalid_request' } }, status: 400 }
}

interface Pagination {
  startCursor?: string
  endCursor?: string
  hasPreviousPage: boolean
  hasNextPage: boolean
}

interface IncomingPaymentsResponse {
  pagination: Pagination
  result: ApiIncomingPaymentsNode[]
}

type ApiIncomingPaymentsNode = Exclude<
  IncomingPayment,
  'typename' | 'receivedAmount' | 'incomingAmount'
> & {
  receivedAmount?: ApiAmount
  incomingAmount?: ApiAmount
}

type ApiAmount = Exclude<GqlAmount, 'typename'>

function incomingPaymentPageToResponse(
  page: IncomingPaymentConnection | null | undefined
): IncomingPaymentsResponse | undefined {
  if (!page)
    return {
      result: [],
      pagination: {
        hasNextPage: false,
        hasPreviousPage: false
      }
    }
  const { edges, pageInfo } = page

  const formattedEdges = edges.map((edge) =>
    incomingPaymentEdgeToResponse(edge)
  )

  return {
    result: formattedEdges,
    pagination: pageInfoToResponse(pageInfo)
  }
}

function pageInfoToResponse(pageInfo: PageInfo): Pagination {
  return {
    endCursor: pageInfo.endCursor ?? undefined,
    startCursor: pageInfo.startCursor ?? undefined,
    hasNextPage: pageInfo.hasNextPage,
    hasPreviousPage: pageInfo.hasPreviousPage
  }
}

function incomingPaymentEdgeToResponse(
  edge: IncomingPaymentEdge
): ApiIncomingPaymentsNode {
  const { __typename: _, node } = edge
  const { __typename, incomingAmount, receivedAmount, ...restOfNode } = node

  const formattedEdge = {
    ...restOfNode,
    receivedAmount: gqlAmountToResponse(receivedAmount)
  }

  if (incomingAmount) {
    Object.assign(formattedEdge, {
      incomingAmount: gqlAmountToResponse(incomingAmount)
    })
  }

  return formattedEdge
}

function gqlAmountToResponse(amount: GqlAmount): ApiAmount {
  const { __typename, ...restOfAmount } = amount
  return restOfAmount
}
