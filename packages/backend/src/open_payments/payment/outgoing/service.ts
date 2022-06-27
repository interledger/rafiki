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
import { AccountService } from '../../account/service'
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
  accountService: AccountService
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
}): boolean {
  if (
    (!access.identifier || access.identifier === identifier) &&
    (!access.interval || !!getInterval(access.interval, payment.createdAt)) &&
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

  let validSendAmount = false
  let validReceiveAmount = false

  for (const access of grantAccess) {
    if (
      validateAccess({
        access,
        payment,
        identifier: `${deps.publicHost}/${payment.accountId}`
      })
    ) {
      if (!access.limits) {
        return true
      }
      if (!access.limits.sendAmount) {
        validSendAmount = true
      }
      if (!access.limits.receiveAmount) {
        validReceiveAmount = true
      }
      if (validSendAmount && validReceiveAmount) {
        return true
      }
      let paymentInterval: Interval | undefined
      if (access.interval) {
        paymentInterval = getInterval(access.interval, payment.createdAt)
        assert.ok(paymentInterval)
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

  let availableSendAmount = validSendAmount
    ? BigInt(0)
    : paymentAccess.reduce(
        (prev, access) =>
          prev + (access.limits?.sendAmount?.value ?? BigInt(0)),
        BigInt(0)
      )
  if (!validSendAmount && availableSendAmount < payment.sendAmount.value) {
    // Payment amount single-handedly exceeds sendAmount limit(s)
    return false
  }

  let availableReceiveAmount = validReceiveAmount
    ? BigInt(0)
    : paymentAccess.reduce(
        (prev, access) =>
          prev + (access.limits?.receiveAmount?.value ?? BigInt(0)),
        BigInt(0)
      )
  if (
    !validReceiveAmount &&
    availableReceiveAmount < payment.receiveAmount.value
  ) {
    // Payment amount single-handedly exceeds receiveAmount limit(s)
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
    if (grantPayment.state === OutgoingPaymentState.Failed) {
      const totalSent = await deps.accountingService.getTotalSent(
        grantPayment.id
      )
      assert.ok(totalSent !== undefined)
      if (totalSent === BigInt(0)) {
        continue
      }
      grantPayment.sentAmount.value = totalSent
    } else {
      grantPayment.sentAmount = grantPayment.sendAmount
    }
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
          identifier: `${deps.publicHost}/${grantPayment.accountId}`
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
  // TODO: Attempt to assign existing payment(s) to unrelatedAccess first
  for (const grantPayment of competingPayments) {
    for (const access of paymentAccess) {
      if (
        validatePaymentAccess({
          access,
          payment: grantPayment,
          identifier: `${deps.publicHost}/${grantPayment.accountId}`
        })
      ) {
        if (!validSendAmount && access.limits?.sendAmount?.value) {
          if (grantPayment.sendAmount.value < access.limits.sendAmount.value) {
            availableSendAmount -= grantPayment.sentAmount.value
            access.limits.sendAmount.value -= grantPayment.sentAmount.value
          } else {
            availableSendAmount -= access.limits.sendAmount.value
            grantPayment.sentAmount.value -= access.limits.sendAmount.value
          }
          if (availableSendAmount < payment.sendAmount.value) {
            return false
          }
        }
        if (!validReceiveAmount && access.limits?.receiveAmount?.value) {
          // Estimate delivered amount of failed payment
          if (grantPayment.state === OutgoingPaymentState.Failed) {
            grantPayment.receiveAmount.value =
              (grantPayment.receiveAmount.value *
                grantPayment.sentAmount.value) /
              grantPayment.sendAmount.value
          }
          if (
            grantPayment.receiveAmount.value < access.limits.receiveAmount.value
          ) {
            availableReceiveAmount -= grantPayment.receiveAmount.value
            access.limits.receiveAmount.value -=
              grantPayment.receiveAmount.value
          } else {
            availableReceiveAmount -= access.limits.receiveAmount.value
            grantPayment.receiveAmount.value -=
              access.limits.receiveAmount.value
          }
          if (availableReceiveAmount < payment.receiveAmount.value) {
            return false
          }
        }
      }
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
