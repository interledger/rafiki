import type { ActionArgs } from '@remix-run/node'
import { json } from '@remix-run/node'
import { mockAccounts } from '~/lib/accounts.server'
import assert from 'assert'
import { gql } from '@apollo/client'
import type { LiquidityMutationResponse } from '../../generated/graphql'
import { apolloClient } from '~/lib/apolloClient'

export enum EventType {
  IncomingPaymentCompleted = 'incoming_payment.completed',
  OutgoingPaymentCreated = 'outgoing_payment.created',
  OutgoingPaymentCompleted = 'outgoing_payment.completed',
  OutgoingPaymentFailed = 'outgoing_payment.failed'
}

export interface WebHook {
  id: string
  eventType: EventType
  data: Record<string, unknown>
}

export interface Amount {
  value: bigint
  assetCode: string
  assetScale: number
}

export async function action({ request }: ActionArgs) {
  const payload = await request.json()
  console.log('received webhook: ', JSON.stringify(payload))

  const wh: WebHook = JSON.parse(payload)
  switch (wh.eventType) {
    case EventType.OutgoingPaymentCreated:
      return handleOutgoingPaymentCreated(wh)
    case EventType.OutgoingPaymentCompleted:
    case EventType.OutgoingPaymentFailed:
      return handleOutgoingPaymentCompletedFailed(wh)
    case EventType.IncomingPaymentCompleted:
      return handleIncomingPaymentCompleted(wh)
  }

  return json(undefined, { status: 200 })
}

export async function handleOutgoingPaymentCompletedFailed(wh: WebHook) {
  if (
    wh.eventType !== EventType.OutgoingPaymentCompleted &&
    wh.eventType !== EventType.OutgoingPaymentFailed
  ) {
    assert.fail('invalid event type')
  }
  const pp = wh.data['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointer(pp)
  assert.ok(acc)

  const amtSend = wh.data['sendAmount'] as Amount
  const amtSent = wh.data['sentAmount'] as Amount

  const toVoid = amtSend.value - amtSent.value

  await mockAccounts.debit(acc.id, amtSent.value, true)
  if (toVoid > 0) {
    await mockAccounts.voidPendingDebit(acc.id, toVoid)
  }

  return json(undefined, { status: 200 })
}

export async function handleOutgoingPaymentCreated(wh: WebHook) {
  assert.equal(wh.eventType, EventType.OutgoingPaymentCreated)
  const pp = wh.data['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointer(pp)
  assert.ok(acc)

  const amt = wh.data['sendAmount'] as Amount
  await mockAccounts.pendingDebit(acc.id, amt.value)

  // notify rafiki
  await apolloClient
    .mutate({
      mutation: gql`
        mutation DepositLiquidity($eventId: String!) {
          depositEventLiquidity(eventId: $eventId) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        eventId: wh.id
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (!query.data) {
        return query.data.depositEventLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return json(undefined, { status: 200 })
}

export async function handleIncomingPaymentCompleted(wh: WebHook) {
  assert.equal(wh.eventType, EventType.IncomingPaymentCompleted)
  const pp = wh.data['paymentPointerId'] as string
  const acc = await mockAccounts.getByPaymentPointer(pp)
  assert.ok(acc)

  const amt = wh.data['receiveAmount'] as Amount
  mockAccounts.credit(acc.id, amt.value, false)

  await apolloClient
    .mutate({
      mutation: gql`
        mutation WithdrawLiquidity($eventId: String!) {
          withdrawEventLiquidity(eventId: $eventId) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        eventId: wh.id
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (!query.data) {
        return query.data.withdrawEventLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return json(undefined, { status: 200 })
}
