import { gql } from '@apollo/client'
import type { LiquidityMutationResponse } from 'generated/graphql'
import type { Amount } from './transactions.server'
import { mockAccounts } from './accounts.server'
import { apolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'
import {
  addAssetLiquidity,
  addPeerLiquidity,
  createWalletAddress
} from './requesters'
import { CONFIG } from '~/lib/parse_config.server'

export enum EventType {
  IncomingPaymentCreated = 'incoming_payment.created',
  IncomingPaymentCompleted = 'incoming_payment.completed',
  IncomingPaymentExpired = 'incoming_payment.expired',
  OutgoingPaymentCreated = 'outgoing_payment.created',
  OutgoingPaymentCompleted = 'outgoing_payment.completed',
  OutgoingPaymentFailed = 'outgoing_payment.failed',
  WalletAddressNotFound = 'wallet_address.not_found',
  AssetLiquidityLow = 'asset.liquidity_low',
  PeerLiquidityLow = 'peer.liquidity_low'
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

export async function handleOutgoingPaymentCreated(wh: WebHook) {
  if (wh.type !== EventType.OutgoingPaymentCreated) {
    throw new Error('Invalid event type when handling outgoing payment webhook')
  }

  const payment = wh.data
  const wa = payment['walletAddressId'] as string
  const acc = await mockAccounts.getByWalletAddressId(wa)

  if (!acc) {
    throw new Error('No account found for wallet address')
  }

  const amt = parseAmount(payment['debitAmount'] as AmountJSON)

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

export async function handleWalletAddressNotFound(wh: WebHook) {
  const walletAddressUrl = wh.data['walletAddressUrl'] as string | undefined

  if (!walletAddressUrl) {
    throw new Error('No walletAddressUrl found')
  }

  const accountPath = walletAddressUrl.split(
    `https://${CONFIG.publicHost}/`
  )[1]

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

export async function handleLowLiquidity(wh: WebHook) {
  const id = wh.data['id'] as string | undefined

  if (!id) {
    throw new Error('id not found')
  }

  if (wh.type == 'asset.liquidity_low') {
    await addAssetLiquidity(id, 1000000, uuid())
  } else {
    await addPeerLiquidity(id, '1000000', uuid())
  }
}
