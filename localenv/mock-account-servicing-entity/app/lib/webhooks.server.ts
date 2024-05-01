import { gql } from '@apollo/client'
import type { LiquidityMutationResponse } from 'generated/graphql'
import type { Amount } from './transactions.server'
import { mockAccounts } from './accounts.server'
import { apolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'
import {
  depositAssetLiquidity,
  depositPeerLiquidity,
  createWalletAddress
} from './requesters'
import { Webhook, WebhookEventType } from 'mock-account-service-lib'

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

export async function handleOutgoingPaymentCompletedFailed(wh: Webhook) {
  if (
    wh.type !== WebhookEventType.OutgoingPaymentCompleted &&
    wh.type !== WebhookEventType.OutgoingPaymentFailed
  ) {
    throw new Error('Invalid event type when handling outgoing payment webhook')
  }
  const payment = wh.data
  const wa = payment['walletAddressId'] as string
  const acc = await mockAccounts.getByWalletAddressId(wa)

  if (!acc) {
    throw new Error('No account found for wallet address')
  }

  const amtDebit = parseAmount(payment['debitAmount'] as AmountJSON)
  const amtSent = parseAmount(payment['sentAmount'] as AmountJSON)

  const toVoid = amtDebit.value - amtSent.value

  await mockAccounts.debit(acc.id, amtSent.value, true)
  if (toVoid > 0) {
    await mockAccounts.voidPendingDebit(acc.id, toVoid)
  }

  // TODO: withdraw remaining liquidity

  return
}

export async function handleOutgoingPaymentCreated(wh: Webhook) {
  if (wh.type !== WebhookEventType.OutgoingPaymentCreated) {
    throw new Error('Invalid event type when handling outgoing payment webhook')
  }

  const payment = wh.data
  const wa = payment['walletAddressId'] as string
  const acc = await mockAccounts.getByWalletAddressId(wa)

  if (!acc) {
    throw new Error('No account found for wallet address')
  }

  const amt = parseAmount(payment['debitAmount'] as AmountJSON)
  const accBalance = BigInt(acc.creditsPosted) - BigInt(acc.debitsPosted)

  if (accBalance < amt.value) {
    await apolloClient.mutate({
      mutation: gql`
        mutation CancelOutgoingPayment($input: CancelOutgoingPaymentInput!) {
          cancelOutgoingPayment(input: $input) {
            code
            success
            message
          }
        }
      `,
      variables: {
        input: {
          id: payment.id,
          reason: 'Account does not have enough balance.'
        }
      }
    })
    return
  }

  await mockAccounts.pendingDebit(acc.id, amt.value)

  // notify rafiki
  await apolloClient
    .mutate({
      mutation: gql`
        mutation DepositOutgoingPaymentLiquidity(
          $input: DepositOutgoingPaymentLiquidityInput!
        ) {
          depositOutgoingPaymentLiquidity(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: {
          outgoingPaymentId: payment.id,
          idempotencyKey: uuid()
        }
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (query.data) {
        return query.data.depositOutgoingPaymentLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return
}

export async function handleIncomingPaymentCompletedExpired(wh: Webhook) {
  if (
    wh.type !== WebhookEventType.IncomingPaymentCompleted &&
    wh.type !== WebhookEventType.IncomingPaymentExpired
  ) {
    throw new Error('Invalid event type when handling incoming payment webhook')
  }

  const payment = wh.data
  const wa = payment['walletAddressId'] as string
  const acc = await mockAccounts.getByWalletAddressId(wa)

  if (!acc) {
    throw new Error('No account found for wallet address')
  }

  const amt = parseAmount(payment['receivedAmount'] as AmountJSON)

  await mockAccounts.credit(acc.id, amt.value, false)

  await apolloClient
    .mutate({
      mutation: gql`
        mutation WithdrawIncomingPaymentLiquidity(
          $input: WithdrawIncomingPaymentLiquidityInput!
        ) {
          withdrawIncomingPaymentLiquidity(input: $input) {
            code
            success
            message
            error
          }
        }
      `,
      variables: {
        input: {
          incomingPaymentId: payment.id,
          idempotencyKey: uuid()
        }
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (query.data) {
        return query.data.withdrawIncomingPaymentLiquidity
      } else {
        throw new Error('Data was empty')
      }
    })

  return
}

export async function handleWalletAddressNotFound(wh: Webhook) {
  const walletAddressUrl = wh.data['walletAddressUrl'] as string | undefined

  if (!walletAddressUrl) {
    throw new Error('No walletAddressUrl found')
  }

  const accountPath = new URL(walletAddressUrl).pathname.substring(1)

  const account = await mockAccounts.getByPath(accountPath)

  if (!account) {
    throw new Error('No account found for wallet address')
  }

  const walletAddress = await createWalletAddress(
    account.name,
    walletAddressUrl,
    account.assetId
  )

  await mockAccounts.setWalletAddress(
    account.id,
    walletAddress.id,
    walletAddress.url
  )
}

export async function handleLowLiquidity(wh: Webhook) {
  const id = wh.data['id'] as string | undefined

  if (!id) {
    throw new Error('id not found')
  }

  if (wh.type == 'asset.liquidity_low') {
    await depositAssetLiquidity(id, 1000000, uuid())
  } else {
    await depositPeerLiquidity(id, '1000000', uuid())
  }
}
