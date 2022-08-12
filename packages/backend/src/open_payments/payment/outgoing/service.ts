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
  identifier,
  paymentInterval
}: {
  access: GrantAccess
  payment: OutgoingPayment
  identifier: string
  paymentInterval: Interval | undefined
}): boolean {
  if (
    (!access.identifier || access.identifier === identifier) &&
    (!access.interval || !!paymentInterval) &&
    (!access.limits || validateAccessLimits(payment, access.limits))
  ) {
    return true
  }
  return false
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

function estimateTotalAvailableAmounts<T extends GrantAccess>(
  accessArray: T[],
  payment: OutgoingPayment,
  slippage: number
) {
  const availableSendAmount = accessArray.reduce(
    (prev: bigint, access: T) =>
      prev + (access.limits?.sendAmount?.value ?? BigInt(0)),
    BigInt(0)
  )

  const availableReceiveAmount = accessArray.reduce(
    (prev: bigint, access: T) =>
      prev + (access.limits?.receiveAmount?.value ?? BigInt(0)),
    BigInt(0)
  )

  const estTotalAvailableSendAmount =
    availableSendAmount +
    BigInt(
      Math.floor(
        (Number(payment.quote.lowEstimatedExchangeRate.b) /
          Number(payment.quote.lowEstimatedExchangeRate.a)) *
          (1 + slippage) *
          Number(availableReceiveAmount)
      )
    )
  const estTotalAvailableReceiveAmount =
    availableReceiveAmount +
    BigInt(
      Math.floor(
        (Number(payment.quote.lowEstimatedExchangeRate.a) /
          Number(payment.quote.lowEstimatedExchangeRate.b)) *
          (1 + slippage) *
          Number(availableSendAmount)
      )
    )
  return { estTotalAvailableSendAmount, estTotalAvailableReceiveAmount }
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

  // Find grant access(es) that authorize this payment (pending send/receive limits).
  const paymentAccess: PaymentAccess[] = []
  const unlimitedAccess: GrantAccess[] = []
  const unrelatedAccess: GrantAccess[] = []

  for (const access of grantAccess) {
    let paymentInterval: Interval | undefined
    if (access.interval) {
      paymentInterval = getInterval(access.interval, payment.createdAt)
      assert.ok(paymentInterval)
    }
    if (
      validateAccess({
        access,
        payment,
        identifier: `${deps.publicHost}/${payment.accountId}`,
        paymentInterval
      })
    ) {
      if (!access.limits?.sendAmount && !access.limits?.receiveAmount) {
        return true
      }
      paymentAccess.push({
        ...access,
        paymentInterval
      })
    } else {
      if (access.limits) {
        unrelatedAccess.push(access)
      } else {
        unlimitedAccess.push(access)
      }
    }
  }

  if (paymentAccess.length === 0) {
    return false
  }
  let {
    estTotalAvailableSendAmount,
    estTotalAvailableReceiveAmount
  } = estimateTotalAvailableAmounts<PaymentAccess>(
    paymentAccess,
    payment,
    deps.slippage
  )

  if (
    estTotalAvailableSendAmount < payment.sendAmount.value ||
    estTotalAvailableReceiveAmount < payment.receiveAmount.value
  ) {
    // Payment amount single-handedly exceeds amount limit(s)
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

  const competingPayments: OutgoingPayment[] = []
  for (const grantPayment of grantPayments) {
    if (
      paymentAccess.find((access) =>
        validatePaymentAccess({
          access,
          payment: grantPayment,
          identifier: `${deps.publicHost}/${grantPayment.accountId}`
        })
      ) &&
      !unlimitedAccess.find((access) =>
        validateAccess({
          access,
          payment: grantPayment,
          identifier: `${deps.publicHost}/${grantPayment.accountId}`,
          paymentInterval: access.interval
            ? getInterval(access.interval, grantPayment.createdAt)
            : undefined
        })
      )
    ) {
      competingPayments.push(grantPayment)
    }
  }
  if (!competingPayments) {
    // The payment may use the entire amount limit(s)
    return true
  }

  // Do paymentAccess limits support payment and competing existing payments?
  for (const grantPayment of competingPayments) {
    let sentAmount: bigint
    let receivedAmount: bigint
    if (grantPayment.state === OutgoingPaymentState.Failed) {
      const totalSent = await deps.accountingService.getTotalSent(
        grantPayment.id
      )
      assert.ok(totalSent !== undefined)
      if (totalSent === BigInt(0)) {
        continue
      }
      grantPayment.sentAmount = { ...grantPayment.sentAmount, value: totalSent }
      sentAmount = totalSent
      // Estimate delivered amount of failed payment
      receivedAmount =
        (grantPayment.receiveAmount.value * sentAmount) /
        grantPayment.sendAmount.value
    } else {
      grantPayment.sentAmount = grantPayment.sendAmount
      sentAmount = grantPayment.sendAmount.value
      receivedAmount = grantPayment.receiveAmount.value
    }

    // Check if competing payment was created with (for current payment) unrelated access
    const competingUnrelatedAccess = unrelatedAccess.filter((access) =>
      validateAccess({
        access,
        payment: grantPayment,
        identifier: `${deps.publicHost}/${grantPayment.accountId}`,
        paymentInterval: access.interval
          ? getInterval(access.interval, grantPayment.createdAt)
          : undefined
      })
    )
    if (competingUnrelatedAccess.length > 0) {
      for (const access of unrelatedAccess) {
        if (competingUnrelatedAccess.indexOf(access) > -1) {
          if (access.limits?.sendAmount) {
            if (access.limits.sendAmount.value > sentAmount) {
              access.limits.sendAmount.value -= sentAmount
              sentAmount = BigInt(0)
              receivedAmount = BigInt(0)
            } else {
              receivedAmount -=
                (access.limits.sendAmount.value *
                  grantPayment.receiveAmount.value) /
                grantPayment.sentAmount.value
              sentAmount -= access.limits.sendAmount.value
              access.limits.sendAmount.value = BigInt(0)
            }
          } else if (access.limits?.receiveAmount) {
            if (access.limits.receiveAmount.value > receivedAmount) {
              access.limits.receiveAmount.value -= receivedAmount
              receivedAmount = BigInt(0)
              sentAmount = BigInt(0)
            } else {
              sentAmount -=
                (access.limits.receiveAmount.value *
                  grantPayment.sentAmount.value) /
                grantPayment.receiveAmount.value
              receivedAmount -= access.limits.receiveAmount.value
              access.limits.receiveAmount.value = BigInt(0)
            }
          }
        }
      }
    }

    estTotalAvailableSendAmount -= sentAmount
    estTotalAvailableReceiveAmount -= receivedAmount
    if (
      estTotalAvailableSendAmount < payment.sendAmount.value ||
      estTotalAvailableReceiveAmount < payment.receiveAmount.value
    ) {
      return false
    }
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
