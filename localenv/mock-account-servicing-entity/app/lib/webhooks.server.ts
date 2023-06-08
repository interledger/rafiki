import { gql } from '@apollo/client'
import type { LiquidityMutationResponse } from 'generated/graphql'
import type { Amount } from './transactions.server'
import { mockAccounts } from './accounts.server'
import { apolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'
import { createPaymentPointer } from './requesters'
import { CONFIG } from './parse_config.server'

export enum EventType {
  IncomingPaymentCreated = 'incoming_payment.created',
  IncomingPaymentCompleted = 'incoming_payment.completed',
  IncomingPaymentExpired = 'incoming_payment.expired',
  OutgoingPaymentCreated = 'outgoing_payment.created',
  OutgoingPaymentCompleted = 'outgoing_payment.completed',
  OutgoingPaymentFailed = 'outgoing_payment.failed',
  PaymentPointerNotFound = 'payment_pointer.not_found'
}

export interface WebHook {
  id: string
  type: EventType
  data: Record<string, unknown>
}

export interface AmountJSON {
  value: string
  assetCode: string
  assetScale: number
}

export function parseAmount(amount: AmountJSON): Amount {
  return {
    value: BigInt(amount['value']),
    assetCode: amount['assetCode'],
    assetScale: amount['assetScale']
  }
}

export async function handleOutgoingPaymentCompletedFailed(wh: WebHook) {
  if (
    wh.type !== EventType.OutgoingPaymentCompleted &&
    wh.type !== EventType.OutgoingPaymentFailed
  ) {
    throw new Error('Invalid event type when handling outgoing payment webhook')
  }
  const payment = wh.data['payment']
  const pp = payment['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointerId(pp)

  if (!acc) {
    throw new Error('No account found for payment pointer')
  }

  const amtSend = parseAmount(payment['sendAmount'])
  const amtSent = parseAmount(payment['sentAmount'])

  const toVoid = amtSend.value - amtSent.value

  await mockAccounts.debit(acc.id, amtSent.value, true)
  if (toVoid > 0) {
    await mockAccounts.voidPendingDebit(acc.id, toVoid)
  }

  // TODO: withdraw remaining liquidity

  return
}

export async function handleOutgoingPaymentCreated(wh: WebHook) {
  if (wh.type !== EventType.OutgoingPaymentCreated) {
    throw new Error('Invalid event type when handling outgoing payment webhook')
  }

  const payment = wh.data['payment']
  const pp = payment['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointerId(pp)

  if (!acc) {
    throw new Error('No account found for payment pointer')
  }

  const amt = parseAmount(payment['sendAmount'])

  await mockAccounts.pendingDebit(acc.id, amt.value)

  // notify rafiki
  await apolloClient
    .mutate({
      mutation: gql`
        mutation DepositEventLiquidity($input: DepositEventLiquidityInput!) {
          depositEventLiquidity(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: {
          eventId: wh.id,
          idempotencyKey: uuid()
        }
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (query.data) {
        return query.data.depositEventLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return
}

export async function handleIncomingPaymentCompletedExpired(wh: WebHook) {
  if (
    wh.type !== EventType.IncomingPaymentCompleted &&
    wh.type !== EventType.IncomingPaymentExpired
  ) {
    throw new Error('Invalid event type when handling incoming payment webhook')
  }

  const payment = wh.data['incomingPayment']
  const pp = payment['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointerId(pp)

  if (!acc) {
    throw new Error('No account found for payment pointer')
  }

  const amt = parseAmount(payment['receivedAmount'])

  await mockAccounts.credit(acc.id, amt.value, false)

  await apolloClient
    .mutate({
      mutation: gql`
        mutation WithdrawEventLiquidity($input: WithdrawEventLiquidityInput!) {
          withdrawEventLiquidity(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: {
          eventId: wh.id,
          idempotencyKey: uuid()
        }
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (query.data) {
        return query.data.withdrawEventLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return
}

export async function handlePaymentPointerNotFound(wh: WebHook) {
  const pp = wh.data['paymentPointerUrl'] as string | undefined

  if (!pp) {
    throw new Error('No account found for payment pointer')
  }

  const accountPath = pp.split(`https://${CONFIG.seed.self.hostname}/`)[1]
  const acc = await mockAccounts.getByPath(accountPath)

  if (!acc) {
    throw new Error('No account found for payment pointer')
  }

  const paymentPointer = await createPaymentPointer(acc.name, pp, acc.assetId)

  await mockAccounts.setPaymentPointer(
    acc.id,
    paymentPointer.id,
    paymentPointer.url
  )
}
