import base64url from 'base64url'
import { StreamServer } from '@interledger/stream-receiver'
import { Logger } from 'pino'
import { validateId } from '../shared/utils'
import { AppContext } from '../app'
import { IAppConfig } from '../config/app'
import { AccountingService } from '../accounting/service'
import { InvoiceService } from './service'
import { Invoice } from './model'

// Don't allow creating an invoice too far out. Invoices with no payments before they expire are cleaned up, since invoice creation is unauthenticated.
// TODO what is a good default value for this?
export const MAX_EXPIRY = 24 * 60 * 60 * 1000 // milliseconds

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  accountingService: AccountingService
  invoiceService: InvoiceService
  streamServer: StreamServer
}

export interface InvoiceRoutes {
  get(ctx: AppContext): Promise<void>
  create(ctx: AppContext): Promise<void>
}

export function createInvoiceRoutes(deps_: ServiceDependencies): InvoiceRoutes {
  const logger = deps_.logger.child({
    service: 'InvoiceRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: AppContext) => getInvoice(deps, ctx),
    create: (ctx: AppContext) => createInvoice(deps, ctx)
  }
}

// Spec: https://docs.openpayments.dev/invoices#get
async function getInvoice(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { invoiceId } = ctx.params
  ctx.assert(validateId(invoiceId), 400, 'invalid id')
  const acceptJSON = ctx.accepts('application/json')
  const acceptStream = ctx.accepts('application/ilp-stream+json')
  ctx.assert(acceptJSON || acceptStream, 406)

  const invoice = await deps.invoiceService.get(invoiceId)
  if (!invoice) return ctx.throw(404)

  const amountReceived = await deps.accountingService.getBalance(invoice.id)
  if (amountReceived === undefined) {
    deps.logger.error({ invoice: invoice.id }, 'balance not found')
    return ctx.throw(500)
  }

  const body = invoiceToBody(deps, invoice, amountReceived)
  ctx.body = body
  if (!acceptStream) return

  const { ilpAddress, sharedSecret } = deps.streamServer.generateCredentials({
    paymentTag: invoice.id,
    // TODO receipt support on invoices?
    //receiptSetup:
    //  nonce && secret
    //    ? {
    //        nonce: Buffer.from(nonce.toString(), 'base64'),
    //        secret: Buffer.from(secret.toString(), 'base64')
    //      }
    //    : undefined,
    asset: {
      code: invoice.paymentPointer.asset.code,
      scale: invoice.paymentPointer.asset.scale
    }
  })

  body['ilpAddress'] = ilpAddress
  body['sharedSecret'] = base64url(sharedSecret)
}

// Spec: https://docs.openpayments.dev/invoices#create
async function createInvoice(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const { paymentPointerId } = ctx.params
  ctx.assert(validateId(paymentPointerId), 400, 'invalid payment pointer')
  ctx.assert(ctx.accepts('application/json'), 406, 'must accept json')
  ctx.assert(
    ctx.get('Content-Type') === 'application/json',
    400,
    'must send json body'
  )

  const { body } = ctx.request
  if (typeof body !== 'object') return ctx.throw(400, 'json body required')
  const amountToReceive = tryParseAmount(body['amount'])
  if (!amountToReceive) return ctx.throw(400, 'invalid amount')
  const expiresAt = Date.parse(body['expiresAt'] as string)
  if (!expiresAt) return ctx.throw(400, 'invalid expiresAt')
  if (body.description !== undefined && typeof body.description !== 'string')
    return ctx.throw(400, 'invalid description')
  if (Date.now() + MAX_EXPIRY < expiresAt)
    return ctx.throw(400, 'expiry too high')
  if (expiresAt < Date.now()) return ctx.throw(400, 'already expired')

  const invoice = await deps.invoiceService.create({
    paymentPointerId,
    description: body.description,
    expiresAt: new Date(expiresAt),
    amountToReceive
  })

  ctx.status = 201
  const res = invoiceToBody(deps, invoice, BigInt(0))
  ctx.body = res
  ctx.set('Location', res.id)
}

function invoiceToBody(
  deps: ServiceDependencies,
  invoice: Invoice,
  received: bigint
) {
  const location = `${deps.config.publicHost}/invoices/${invoice.id}`
  return {
    id: location,
    account: `${deps.config.publicHost}/pay/${invoice.paymentPointerId}`,
    amount: invoice.amountToReceive?.toString(),
    assetCode: invoice.paymentPointer.asset.code,
    assetScale: invoice.paymentPointer.asset.scale,
    description: invoice.description,
    expiresAt: invoice.expiresAt?.toISOString(),
    received: received.toString()
  }
}

function tryParseAmount(amount: unknown): bigint | null {
  try {
    return BigInt(amount)
  } catch (_) {
    return null
  }
}
