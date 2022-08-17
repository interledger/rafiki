import assert from 'assert'
import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { Pagination } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import {
  FundingError,
  OutgoingPaymentError,
  isOutgoingPaymentError
} from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  PaymentEventType
} from './model'
import { AccountingService } from '../../../accounting/service'
import { PeerService } from '../../../peer/service'
import {
  Grant,
  GrantAccess,
  AccessType,
  AccessAction,
  AccessLimits,
  getInterval
} from '../../auth/grant'
import { IlpPlugin, IlpPluginOptions } from '../../../shared/ilp_plugin'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'
import { Interval } from 'luxon'

export interface OutgoingPaymentService {
  get(id: string): Promise<OutgoingPayment | undefined>
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
  processNext(): Promise<string | undefined>
  getAccountPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<OutgoingPayment[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  peerService: PeerService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
  publicHost: string
  slippage: number
}

export async function createOutgoingPaymentService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    get: (id) => getOutgoingPayment(deps, id),
    create: (options: CreateOutgoingPaymentOptions) =>
      createOutgoingPayment(deps, options),
    fund: (options) => fundPayment(deps, options),
    processNext: () => worker.processPendingPayment(deps),
    getAccountPage: (accountId, pagination) =>
      getAccountPage(deps, accountId, pagination)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  id: string
): Promise<OutgoingPayment | undefined> {
  const outgoingPayment = await OutgoingPayment.query(deps.knex)
    .findById(id)
    .withGraphJoined('quote.asset')
  if (outgoingPayment) return await addSentAmount(deps, outgoingPayment)
  else return
}

export interface CreateOutgoingPaymentOptions {
  accountId: string
  quoteId: string
  description?: string
  externalRef?: string
  grant?: Grant
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          id: options.quoteId,
          accountId: options.accountId,
          description: options.description,
          externalRef: options.externalRef,
          state: OutgoingPaymentState.Funding,
          grant: options.grant?.grant
        })
        .withGraphFetched('[quote.asset]')

      if (
        payment.accountId !== payment.quote.accountId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      if (options.grant) {
        if (
          !(await validateGrant(
            {
              ...deps,
              knex: trx
            },
            payment,
            options.grant
          ))
        ) {
          throw OutgoingPaymentError.InsufficientGrant
        }
      }
      const plugin = deps.makeIlpPlugin({
        sourceAccount: {
          id: payment.accountId,
          asset: {
            id: payment.assetId,
            unit: payment.asset.unit
          }
        },
        unfulfillable: true
      })
      try {
        await plugin.connect()
        const destination = await Pay.setupPayment({
          plugin,
          destinationPayment: payment.receiver
        })
        const peer = await deps.peerService.getByDestinationAddress(
          destination.destinationAddress
        )
        if (peer) {
          await payment.$query(trx).patch({ peerId: peer.id })
        }
      } finally {
        plugin.disconnect().catch((err: Error) => {
          deps.logger.warn({ error: err.message }, 'error disconnecting plugin')
        })
      }

      // TODO: move to fundPayment
      await deps.accountingService.createLiquidityAccount({
        id: payment.id,
        asset: payment.asset
      })
      await sendWebhookEvent(
        {
          ...deps,
          knex: trx
        },
        payment,
        PaymentEventType.PaymentCreated
      )
      return await addSentAmount(deps, payment, BigInt(0))
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'outgoingpayments_id_foreign') {
        return OutgoingPaymentError.UnknownQuote
      } else if (err.constraint === 'outgoingpayments_accountid_foreign') {
        return OutgoingPaymentError.UnknownAccount
      }
    } else if (isOutgoingPaymentError(err)) {
      return err
    }
    throw err
  }
}

function validateAccess({
  access,
  payment,
  identifier
}: {
  access: GrantAccess
  payment: OutgoingPayment
  identifier: string
}): PaymentAccess | undefined {
  let paymentInterval: Interval | undefined
  if (access.interval)
    paymentInterval = getInterval(access.interval, payment.createdAt)
  if (
    (!access.identifier || access.identifier === identifier) &&
    (!access.interval || paymentInterval !== undefined) &&
    (!access.limits || validateAccessLimits(payment, access.limits))
  ) {
    return { ...access, paymentInterval }
  }
}

function validatePaymentAccess({
  access,
  payment,
  identifier
}: {
  access: PaymentAccess
  payment: OutgoingPayment
  identifier: string
}): boolean {
  if (
    (!access.identifier || access.identifier === identifier) &&
    (!access.paymentInterval ||
      (access.paymentInterval.start.toMillis() <= payment.createdAt.getTime() &&
        payment.createdAt.getTime() < access.paymentInterval.end.toMillis())) &&
    (!access.limits || validateAccessLimits(payment, access.limits))
  ) {
    return true
  }
  return false
}

function validateAccessLimits(
  payment: OutgoingPayment,
  limits: AccessLimits
): boolean {
  if (
    (!limits.receiver || payment.receiver === limits?.receiver) &&
    (!limits.description || payment.description === limits?.description) &&
    (!limits.externalRef || payment.externalRef === limits?.externalRef) &&
    validateAmountAssets(payment, limits)
  ) {
    return true
  }
  return false
}

function validateAmountAssets(
  payment: OutgoingPayment,
  limits: AccessLimits
): boolean {
  if (
    limits.sendAmount &&
    (limits.sendAmount.assetCode !== payment.asset.code ||
      limits.sendAmount.assetScale !== payment.asset.scale)
  ) {
    return false
  }
  return (
    !limits.receiveAmount ||
    (limits.receiveAmount.assetCode === payment.receiveAmount.assetCode &&
      limits.receiveAmount.assetScale === payment.receiveAmount.assetScale)
  )
}

interface PaymentAccess extends GrantAccess {
  paymentInterval?: Interval
}

// "payment" is locked by the "deps.knex" transaction.
async function validateGrant(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  grant: Grant
): Promise<boolean> {
  const grantAccess = grant.getAccess({
    type: AccessType.OutgoingPayment,
    action: AccessAction.Create
  })

  if (!grantAccess) {
    // log?
    return false
  }

  const paymentAccess = validateAccess({
    access: grantAccess,
    payment,
    identifier: `${deps.publicHost}/${payment.accountId}`
  })
  if (!paymentAccess) {
    return false
  }
  if (
    !paymentAccess.limits?.sendAmount &&
    !paymentAccess.limits?.receiveAmount
  ) {
    return true
  }
  if (
    (paymentAccess.limits.sendAmount &&
      paymentAccess.limits.sendAmount.value < payment.sendAmount.value) ||
    (paymentAccess.limits.receiveAmount &&
      paymentAccess.limits.receiveAmount.value < payment.receiveAmount.value)
  ) {
    // Payment amount single-handedly exceeds amount limit
    return false
  }

  // TODO: lock to prevent multiple grant payments from being created concurrently?
  const grantPayments = await OutgoingPayment.query(deps.knex)
    .where({
      grant: grant.grant
    })
    .andWhereNot({
      id: payment.id
    })
    .withGraphFetched('[quote.asset]')

  if (grantPayments.length === 0) {
    return true
  }

  let sentAmount = BigInt(0)
  let receivedAmount = BigInt(0)
  for (const grantPayment of grantPayments) {
    if (
      validatePaymentAccess({
        access: paymentAccess,
        payment: grantPayment,
        identifier: `${deps.publicHost}/${grantPayment.accountId}`
      })
    ) {
      if (grantPayment.state === OutgoingPaymentState.Failed) {
        const totalSent = await deps.accountingService.getTotalSent(
          grantPayment.id
        )
        assert.ok(totalSent !== undefined)
        if (totalSent === BigInt(0)) {
          continue
        }
        sentAmount += totalSent
        // Estimate delivered amount of failed payment
        receivedAmount +=
          (grantPayment.receiveAmount.value * totalSent) /
          grantPayment.sendAmount.value
      } else {
        sentAmount += grantPayment.sendAmount.value
        receivedAmount += grantPayment.receiveAmount.value
      }
    }
  }
  if (
    (paymentAccess.limits.sendAmount &&
      paymentAccess.limits.sendAmount.value - sentAmount <
        payment.sendAmount.value) ||
    (paymentAccess.limits.receiveAmount &&
      paymentAccess.limits.receiveAmount.value - receivedAmount <
        payment.receiveAmount.value)
  ) {
    return false
  }
  return true
}

export interface FundOutgoingPaymentOptions {
  id: string
  amount: bigint
  transferId: string
}

async function fundPayment(
  deps: ServiceDependencies,
  { id, amount, transferId }: FundOutgoingPaymentOptions
): Promise<OutgoingPayment | FundingError> {
  return deps.knex.transaction(async (trx) => {
    const payment = await OutgoingPayment.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('[quote.asset]')
    if (!payment) return FundingError.UnknownPayment
    if (payment.state !== OutgoingPaymentState.Funding) {
      return FundingError.WrongState
    }
    if (amount !== payment.sendAmount.value) return FundingError.InvalidAmount
    const error = await deps.accountingService.createDeposit({
      id: transferId,
      account: payment,
      amount
    })
    if (error) {
      return error
    }
    await payment.$query(trx).patch({ state: OutgoingPaymentState.Sending })
    return await addSentAmount(deps, payment)
  })
}

async function getAccountPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex)
    .getPage(pagination)
    .where({
      accountId
    })
    .withGraphFetched('quote.asset')

  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    try {
      payment.sentAmount = {
        value: BigInt(amounts[i]),
        assetCode: payment.asset.code,
        assetScale: payment.asset.scale
      }
    } catch (_) {
      deps.logger.error({ payment: payment.id }, 'account not found')
      throw new Error(
        `Underlying TB account not found, payment id: ${payment.id}`
      )
    }
    return payment
  })
}

async function addSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  value?: bigint
): Promise<OutgoingPayment> {
  const received =
    value || (await deps.accountingService.getTotalSent(payment.id))
  if (received !== undefined) {
    payment.sentAmount = {
      value: received,
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
  } else {
    deps.logger.error({ outgoingPayment: payment.id }, 'account not found')
    throw new Error(
      `Underlying TB account not found, payment id: ${payment.id}`
    )
  }
  return payment
}
