import assert from 'assert'
import { ForeignKeyViolationError, TransactionOrKnex } from 'objection'
import * as Pay from '@interledger/pay'

import { Pagination } from '../../../shared/baseModel'
import { BaseService } from '../../../shared/baseService'
import {
  FundingError,
  isOutgoingPaymentError,
  OutgoingPaymentError
} from './errors'
import {
  OutgoingPayment,
  OutgoingPaymentState,
  PaymentEventType
} from './model'
import { AccountingService } from '../../../accounting/service'
import { PeerService } from '../../../peer/service'
import { Grant, AccessLimits, getInterval } from '../../auth/grant'
import { Grant as GrantModel } from '../../auth/grantModel'
import { IlpPlugin, IlpPluginOptions } from '../../../shared/ilp_plugin'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'
import {
  areAllAccountExistsErrors,
  CreateAccountError
} from '../../../accounting/errors'
import { Interval } from 'luxon'
import { knex } from 'knex'

export interface OutgoingPaymentService {
  get(id: string, clientId?: string): Promise<OutgoingPayment | undefined>
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
  processNext(): Promise<string | undefined>
  getPaymentPointerPage(
    paymentPointerId: string,
    pagination?: Pagination,
    clientId?: string
  ): Promise<OutgoingPayment[]>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  peerService: PeerService
  makeIlpPlugin: (options: IlpPluginOptions) => IlpPlugin
  publicHost: string
}

export async function createOutgoingPaymentService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    get: (id, clientId) => getOutgoingPayment(deps, id, clientId),
    create: (options: CreateOutgoingPaymentOptions) =>
      createOutgoingPayment(deps, options),
    fund: (options) => fundPayment(deps, options),
    processNext: () => worker.processPendingPayment(deps),
    getPaymentPointerPage: (paymentPointerId, pagination, clientId) =>
      getPaymentPointerPage(deps, paymentPointerId, pagination, clientId)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  id: string,
  clientId?: string
): Promise<OutgoingPayment | undefined> {
  let outgoingPayment: OutgoingPayment
  if (!clientId) {
    outgoingPayment = await OutgoingPayment.query(deps.knex)
      .findById(id)
      .withGraphJoined('quote.asset')
  } else {
    outgoingPayment = await OutgoingPayment.query(deps.knex)
      .findById(id)
      .withGraphJoined('[quote.asset, grant]')
      .where('grant.clientId', clientId)
  }
  if (outgoingPayment) return await addSentAmount(deps, outgoingPayment)
  else return
}

export interface CreateOutgoingPaymentOptions {
  paymentPointerId: string
  quoteId: string
  grant?: Grant | string
  description?: string
  externalRef?: string
  callback?: (f: unknown) => NodeJS.Timeout
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateOutgoingPaymentOptions
): Promise<OutgoingPayment | OutgoingPaymentError> {
  const grantId = options.grant
    ? typeof options.grant === 'string'
      ? options.grant
      : options.grant.grant
    : undefined
  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          id: options.quoteId,
          paymentPointerId: options.paymentPointerId,
          description: options.description,
          externalRef: options.externalRef,
          state: OutgoingPaymentState.Funding,
          grantId
        })
        .withGraphFetched('[quote.asset]')

      if (
        payment.paymentPointerId !== payment.quote.paymentPointerId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      if (options.grant && typeof options.grant !== 'string') {
        if (
          !(await validateGrant(
            {
              ...deps,
              knex: trx
            },
            payment,
            options.grant,
            options.callback
          ))
        ) {
          throw OutgoingPaymentError.InsufficientGrant
        }
      }

      const plugin = deps.makeIlpPlugin({
        sourceAccount: {
          id: payment.paymentPointerId,
          asset: {
            id: payment.assetId,
            ledger: payment.asset.ledger
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
      } else if (
        err.constraint === 'outgoingpayments_paymentpointerid_foreign'
      ) {
        return OutgoingPaymentError.UnknownPaymentPointer
      }
    } else if (isOutgoingPaymentError(err)) {
      return err
    } else if (err instanceof knex.KnexTimeoutError) {
      deps.logger.error({ grant: grantId }, 'grant locked')
    }
    throw err
  }
}

function validateAccessLimits(
  payment: OutgoingPayment,
  limits: AccessLimits
): PaymentLimits | undefined {
  if (
    (!limits.receiver || payment.receiver === limits?.receiver) &&
    validateAmountAssets(payment, limits)
  ) {
    let paymentInterval: Interval | undefined
    if (limits.interval)
      paymentInterval = getInterval(limits.interval, payment.createdAt)
    if (!limits.interval || !!paymentInterval) {
      return { ...limits, paymentInterval }
    }
  }
}

function validatePaymentInterval({
  limits,
  payment
}: {
  limits: PaymentLimits
  payment: OutgoingPayment
}): boolean {
  return (
    !limits.paymentInterval ||
    (limits.paymentInterval.start.toMillis() <= payment.createdAt.getTime() &&
      payment.createdAt.getTime() < limits.paymentInterval.end.toMillis())
  )
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

interface PaymentLimits extends AccessLimits {
  paymentInterval?: Interval
}

// "payment" is locked by the "deps.knex" transaction.
async function validateGrant(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  grant: Grant,
  callback?: (f: unknown) => NodeJS.Timeout
): Promise<boolean> {
  const grantAccess = grant.access[0]
  if (!grantAccess.limits) {
    return true
  }
  const paymentLimits = validateAccessLimits(payment, grantAccess.limits)
  if (!paymentLimits) {
    return false
  }
  if (!paymentLimits.sendAmount && !paymentLimits.receiveAmount) return true
  if (
    (paymentLimits.sendAmount &&
      paymentLimits.sendAmount.value < payment.sendAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value < payment.receiveAmount.value)
  ) {
    // Payment amount single-handedly exceeds amount limit
    return false
  }

  //lock grant
  //TODO: update to use objection once it supports forNoKeyUpdate
  await deps
    .knex<GrantModel>('grants')
    .select()
    .where('id', grant.grant)
    .forNoKeyUpdate()
    .timeout(5000)
  if (callback) await new Promise(callback)

  const grantPayments = await OutgoingPayment.query(deps.knex)
    .where({
      grantId: grant.grant
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
      validatePaymentInterval({
        limits: paymentLimits,
        payment: grantPayment
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
    (paymentLimits.sendAmount &&
      paymentLimits.sendAmount.value - sentAmount < payment.sendAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value - receivedAmount <
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

    // Create the outgoing payment liquidity account before trying to transfer funds to it.
    try {
      await deps.accountingService.createLiquidityAccount({
        id: id,
        asset: payment.asset
      })
    } catch (err) {
      // Don't complain if liquidity account already exists.
      if (
        err instanceof CreateAccountError &&
        areAllAccountExistsErrors([err.code])
      ) {
        // Do nothing.
      } else {
        throw err
      }
    }

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

async function getPaymentPointerPage(
  deps: ServiceDependencies,
  paymentPointerId: string,
  pagination?: Pagination,
  clientId?: string
): Promise<OutgoingPayment[]> {
  let page: OutgoingPayment[]
  if (!clientId) {
    page = await OutgoingPayment.query(deps.knex)
      .getPage(pagination)
      .where({
        paymentPointerId
      })
      .withGraphFetched('quote.asset')
  } else {
    page = await OutgoingPayment.query(deps.knex)
      .getPage(pagination)
      .where('outgoingPayments.paymentPointerId', paymentPointerId)
      .andWhere('grant.clientId', clientId)
      .withGraphJoined('[quote.asset, grant]')
  }

  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    try {
      assert.ok(
        amounts[i] !== undefined ||
          payment.state === OutgoingPaymentState.Funding
      )
      payment.sentAmount = {
        value: amounts[i] ?? BigInt(0),
        assetCode: payment.asset.code,
        assetScale: payment.asset.scale
      }
    } catch (err) {
      deps.logger.error(
        { payment: payment.id },
        'outgoing account not found',
        err
      )
      throw new Error(
        `Underlying TB account not found, outgoing payment id: ${payment.id}`
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
  const fundingZeroOrUndefined =
    payment.state === OutgoingPaymentState.Funding ? BigInt(0) : undefined
  let sent = value || (await deps.accountingService.getTotalSent(payment.id))
  if (sent === undefined) {
    sent = fundingZeroOrUndefined
  }

  if (sent !== undefined) {
    payment.sentAmount = {
      value: sent,
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
  } else {
    deps.logger.error(
      { outgoingPayment: payment.id, state: payment.state, sent: sent },
      'account not found for addSentAmount'
    )
    throw new Error(
      `Underlying TB account not found, outgoing payment id: ${payment.id}`
    )
  }
  return payment
}
