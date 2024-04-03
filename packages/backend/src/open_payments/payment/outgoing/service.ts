import {
  ForeignKeyViolationError,
  TransactionOrKnex,
  UniqueViolationError
} from 'objection'

import { BaseService } from '../../../shared/baseService'
import {
  FundingError,
  isOutgoingPaymentError,
  OutgoingPaymentError
} from './errors'
import { Limits, getInterval } from './limits'
import {
  OutgoingPayment,
  OutgoingPaymentGrant,
  OutgoingPaymentState,
  OutgoingPaymentEventType
} from './model'
import { Grant } from '../../auth/middleware'
import {
  AccountingService,
  LiquidityAccountType
} from '../../../accounting/service'
import { PeerService } from '../../../payment-method/ilp/peer/service'
import { ReceiverService } from '../../receiver/service'
import { GetOptions, ListOptions } from '../../wallet_address/model'
import {
  WalletAddressService,
  WalletAddressSubresourceService
} from '../../wallet_address/service'
import { sendWebhookEvent } from './lifecycle'
import * as worker from './worker'
import { Interval } from 'luxon'
import { knex } from 'knex'
import { AccountAlreadyExistsError } from '../../../accounting/errors'
import { PaymentMethodHandlerService } from '../../../payment-method/handler/service'
import { TelemetryService } from '../../../telemetry/service'
import { Amount } from '../../amount'

export interface OutgoingPaymentService
  extends WalletAddressSubresourceService<OutgoingPayment> {
  create(
    options: CreateOutgoingPaymentOptions
  ): Promise<OutgoingPayment | OutgoingPaymentError>
  fund(
    options: FundOutgoingPaymentOptions
  ): Promise<OutgoingPayment | FundingError>
  processNext(): Promise<string | undefined>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  accountingService: AccountingService
  receiverService: ReceiverService
  peerService: PeerService
  paymentMethodHandlerService: PaymentMethodHandlerService
  walletAddressService: WalletAddressService
  telemetry?: TelemetryService
}

export async function createOutgoingPaymentService(
  deps_: ServiceDependencies
): Promise<OutgoingPaymentService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'OutgoingPaymentService' })
  }
  return {
    get: (options) => getOutgoingPayment(deps, options),
    create: (options: CreateOutgoingPaymentOptions) =>
      createOutgoingPayment(deps, options),
    fund: (options) => fundPayment(deps, options),
    processNext: () => worker.processPendingPayment(deps),
    getWalletAddressPage: (options) => getWalletAddressPage(deps, options)
  }
}

async function getOutgoingPayment(
  deps: ServiceDependencies,
  options: GetOptions
): Promise<OutgoingPayment | undefined> {
  const outgoingPayment = await OutgoingPayment.query(deps.knex)
    .get(options)
    .withGraphFetched('[quote.asset, walletAddress]')

  if (outgoingPayment) {
    return addSentAmount(deps, outgoingPayment)
  }
}

interface CreateBase {
  walletAddressId: string
  client?: string
  grant?: Grant
  metadata?: Record<string, unknown>
  callback?: (f: unknown) => NodeJS.Timeout
  grantLockTimeoutMs?: number
}

export interface CreateFromQuote extends CreateBase {
  quoteId: string
}

export interface CreateFromIncomingPayment extends CreateBase {
  incomingPaymentId: string
  debitAmount: Amount
}

export type CreateOutgoingPaymentOptions =
  | CreateFromQuote
  | CreateFromIncomingPayment

function isCreateFromQuote(
  options: CreateOutgoingPaymentOptions
): options is CreateFromQuote {
  return 'quoteId' in options
}

function isCreateFromIncomingPayment(
  options: CreateOutgoingPaymentOptions
): options is CreateFromIncomingPayment {
  return 'incomingPaymentId' in options && 'debitAmount' in options
}

async function createOutgoingPayment(
  deps: ServiceDependencies,
  options: CreateFromQuote | CreateFromIncomingPayment
): Promise<OutgoingPayment | OutgoingPaymentError> {
  if (isCreateFromIncomingPayment(options)) {
    throw new Error('Create from Incoming Payment not implemented')
  }

  const grantId = options.grant?.id
  const walletAddressId = options.walletAddressId
  try {
    return await OutgoingPayment.transaction(deps.knex, async (trx) => {
      const walletAddress = await deps.walletAddressService.get(walletAddressId)
      if (!walletAddress) {
        throw OutgoingPaymentError.UnknownWalletAddress
      }
      if (!walletAddress.isActive) {
        throw OutgoingPaymentError.InactiveWalletAddress
      }

      if (grantId) {
        await OutgoingPaymentGrant.query(trx)
          .insert({
            id: grantId
          })
          .onConflict('id')
          .ignore()
      }
      const payment = await OutgoingPayment.query(trx)
        .insertAndFetch({
          id: options.quoteId,
          walletAddressId: walletAddressId,
          metadata: options.metadata,
          state: OutgoingPaymentState.Funding,
          client: options.client,
          grantId
        })
        .withGraphFetched('[quote.asset, walletAddress]')

      if (
        payment.walletAddressId !== payment.quote.walletAddressId ||
        payment.quote.expiresAt.getTime() <= payment.createdAt.getTime()
      ) {
        throw OutgoingPaymentError.InvalidQuote
      }

      if (options.grant) {
        if (
          !(await validateGrant(
            deps,
            payment,
            options.grant,
            trx,
            options.callback,
            options.grantLockTimeoutMs
          ))
        ) {
          throw OutgoingPaymentError.InsufficientGrant
        }
      }
      const receiver = await deps.receiverService.get(payment.receiver)
      if (!receiver) {
        throw OutgoingPaymentError.InvalidQuote
      }
      const peer = await deps.peerService.getByDestinationAddress(
        receiver.ilpAddress
      )
      if (peer) {
        await payment.$query(trx).patch({ peerId: peer.id })
      }

      await sendWebhookEvent(
        deps,
        payment,
        OutgoingPaymentEventType.PaymentCreated,
        trx
      )
      return await addSentAmount(deps, payment, BigInt(0))
    })
  } catch (err) {
    if (err instanceof UniqueViolationError) {
      if (err.constraint === 'outgoingPayments_pkey') {
        return OutgoingPaymentError.InvalidQuote
      }
    } else if (err instanceof ForeignKeyViolationError) {
      if (err.constraint === 'outgoingpayments_id_foreign') {
        return OutgoingPaymentError.UnknownQuote
      } else if (
        err.constraint === 'outgoingpayments_walletaddressid_foreign'
      ) {
        return OutgoingPaymentError.UnknownWalletAddress
      }
    } else if (isOutgoingPaymentError(err)) {
      return err
    } else if (err instanceof knex.KnexTimeoutError) {
      deps.logger.error(
        { grant: grantId },
        'Could not create outgoing payment: grant locked'
      )
    }
    throw err
  }
}

function validateAccessLimits(
  payment: OutgoingPayment,
  limits: Limits
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
    (limits.paymentInterval.start !== null &&
      limits.paymentInterval.start.toMillis() <= payment.createdAt.getTime() &&
      limits.paymentInterval.end !== null &&
      payment.createdAt.getTime() < limits.paymentInterval.end.toMillis())
  )
}

function validateAmountAssets(
  payment: OutgoingPayment,
  limits: Limits
): boolean {
  if (
    limits.debitAmount &&
    (limits.debitAmount.assetCode !== payment.asset.code ||
      limits.debitAmount.assetScale !== payment.asset.scale)
  ) {
    return false
  }
  return (
    !limits.receiveAmount ||
    (limits.receiveAmount.assetCode === payment.receiveAmount.assetCode &&
      limits.receiveAmount.assetScale === payment.receiveAmount.assetScale)
  )
}

interface PaymentLimits extends Limits {
  paymentInterval?: Interval
}

// "payment" is locked by the "deps.knex" transaction.
async function validateGrant(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  grant: Grant,
  trx: TransactionOrKnex,
  callback?: (f: unknown) => NodeJS.Timeout,
  grantLockTimeoutMs: number = 5000
): Promise<boolean> {
  if (!grant.limits) {
    return true
  }
  const paymentLimits = validateAccessLimits(payment, grant.limits)
  if (!paymentLimits) {
    return false
  }
  if (!paymentLimits.debitAmount && !paymentLimits.receiveAmount) return true
  if (
    (paymentLimits.debitAmount &&
      paymentLimits.debitAmount.value < payment.debitAmount.value) ||
    (paymentLimits.receiveAmount &&
      paymentLimits.receiveAmount.value < payment.receiveAmount.value)
  ) {
    // Payment amount single-handedly exceeds amount limit
    return false
  }

  await OutgoingPaymentGrant.query(trx || deps.knex)
    .where('id', grant.id)
    .forNoKeyUpdate()
    .timeout(grantLockTimeoutMs)

  if (callback) await new Promise(callback)

  const grantPayments = await OutgoingPayment.query(trx || deps.knex)
    .where({
      grantId: grant.id
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
      if (grantPayment.failed) {
        const totalSent = validateSentAmount(
          deps,
          payment,
          await deps.accountingService.getTotalSent(grantPayment.id)
        )

        if (totalSent === BigInt(0)) {
          continue
        }
        sentAmount += totalSent
        // Estimate delivered amount of failed payment
        receivedAmount +=
          (grantPayment.receiveAmount.value * totalSent) /
          grantPayment.debitAmount.value
      } else {
        sentAmount += grantPayment.debitAmount.value
        receivedAmount += grantPayment.receiveAmount.value
      }
    }
  }
  if (
    (paymentLimits.debitAmount &&
      paymentLimits.debitAmount.value - sentAmount <
        payment.debitAmount.value) ||
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
    if (amount !== payment.debitAmount.value) return FundingError.InvalidAmount

    // Create the outgoing payment liquidity account before trying to transfer funds to it.
    try {
      await deps.accountingService.createLiquidityAccount(
        {
          id: id,
          asset: payment.asset
        },
        LiquidityAccountType.OUTGOING
      )
    } catch (err) {
      // Don't complain if liquidity account already exists.
      if (err instanceof AccountAlreadyExistsError) {
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

async function getWalletAddressPage(
  deps: ServiceDependencies,
  options: ListOptions
): Promise<OutgoingPayment[]> {
  const page = await OutgoingPayment.query(deps.knex)
    .list(options)
    .withGraphFetched('[quote.asset, walletAddress]')
  const amounts = await deps.accountingService.getAccountsTotalSent(
    page.map((payment: OutgoingPayment) => payment.id)
  )
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
  return page.map((payment: OutgoingPayment, i: number) => {
    payment.sentAmount = {
      value: validateSentAmount(deps, payment, amounts[i]),
      assetCode: payment.asset.code,
      assetScale: payment.asset.scale
    }
    return payment
  })
}

async function addSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  value?: bigint
): Promise<OutgoingPayment> {
  const sentAmount =
    value ?? (await deps.accountingService.getTotalSent(payment.id))

  payment.sentAmount = {
    value: validateSentAmount(deps, payment, sentAmount),
    assetCode: payment.asset.code,
    assetScale: payment.asset.scale
  }

  return payment
}

function validateSentAmount(
  deps: ServiceDependencies,
  payment: OutgoingPayment,
  sentAmount: bigint | undefined
): bigint {
  if (sentAmount !== undefined) {
    return sentAmount
  }

  if (payment.state === OutgoingPaymentState.Funding) {
    return BigInt(0)
  }

  const errorMessage =
    'Could not get amount sent for payment. There was a problem getting the associated liquidity account.'

  deps.logger.error(
    { outgoingPayment: payment.id, state: payment.state },
    errorMessage
  )
  throw new Error(errorMessage)
}
