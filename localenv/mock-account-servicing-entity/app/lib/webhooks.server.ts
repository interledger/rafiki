import { gql } from '@apollo/client'
import type { LiquidityMutationResponse } from 'generated/graphql'
import type { Amount } from './transactions.server'
import { mockAccounts } from './accounts.server'
import { generateApolloClient } from './apolloClient'
import { v4 as uuid } from 'uuid'
import {
  depositAssetLiquidity,
  depositPeerLiquidity,
  createWalletAddress
} from './requesters'
import { Webhook, WebhookEventType } from 'mock-account-service-lib'
import { TenantOptions } from './types'

export interface AmountJSON {
  value: string
  assetCode: string
  assetScale: number
}

export interface WalletAddressObject {
  id: string
  createdAt: string
  receivedAmount: AmountJSON
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

export async function handleOutgoingPaymentCreated(
  wh: Webhook,
  options?: TenantOptions
) {
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

  try {
    await mockAccounts.pendingDebit(acc.id, amt.value)
  } catch (err) {
    await generateApolloClient(options).mutate({
      mutation: gql`
        mutation CancelOutgoingPayment($input: CancelOutgoingPaymentInput!) {
          cancelOutgoingPayment(input: $input) {
            payment {
              id
            }
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

  // notify rafiki
  await generateApolloClient(options)
    .mutate({
      mutation: gql`
        mutation DepositOutgoingPaymentLiquidity(
          $input: DepositOutgoingPaymentLiquidityInput!
        ) {
          depositOutgoingPaymentLiquidity(input: $input) {
            success
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

export async function handleIncomingPaymentCompletedExpired(
  wh: Webhook,
  options?: TenantOptions
) {
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

  await generateApolloClient(options)
    .mutate({
      mutation: gql`
        mutation CreateIncomingPaymentWithdrawal(
          $input: CreateIncomingPaymentWithdrawalInput!
        ) {
          createIncomingPaymentWithdrawal(input: $input) {
            success
          }
        }
      `,
      variables: {
        input: {
          incomingPaymentId: payment.id,
          idempotencyKey: uuid(),
          timeoutSeconds: 0
        }
      }
    })
    .then((query): LiquidityMutationResponse => {
      if (query.data) {
        return query.data.createIncomingPaymentWithdrawal
      } else {
        throw new Error('Data was empty')
      }
    })

  return
}

export async function handleWalletAddressWebMonetization(
  wh: Webhook,
  options?: TenantOptions
) {
  const walletAddressObj = wh.data.walletAddress as WalletAddressObject
  const walletAddressId = walletAddressObj.id

  if (!walletAddressId) {
    throw new Error('No walletAddressId found')
  }

  const account = await mockAccounts.getByWalletAddressId(walletAddressId)
  if (!account) {
    throw new Error('No account found for wallet address')
  }

  // generate an ID, we do not have an id in wh.data
  const withdrawalId = uuid()

  try {
    await generateApolloClient(options).mutate({
      mutation: gql`
        mutation CreateWalletAddressWithdrawal(
          $input: CreateWalletAddressWithdrawalInput!
        ) {
          createWalletAddressWithdrawal(input: $input) {
            withdrawal {
              amount
              id
              walletAddress {
                id
                url
                asset {
                  id
                  code
                  scale
                  withdrawalThreshold
                }
              }
            }
          }
        }
      `,
      variables: {
        input: {
          id: withdrawalId,
          walletAddressId,
          idempotencyKey: uuid()
        }
      }
    })

    const amount = parseAmount(walletAddressObj.receivedAmount as AmountJSON)
    await mockAccounts.credit(account.id, amount.value, true)

    return await generateApolloClient(options).mutate({
      mutation: gql`
        mutation PostLiquidityWithdrawal(
          $input: PostLiquidityWithdrawalInput!
        ) {
          postLiquidityWithdrawal(input: $input) {
            success
          }
        }
      `,
      variables: {
        input: {
          withdrawalId: withdrawalId,
          idempotencyKey: uuid()
        }
      }
    })
  } catch (err) {
    throw new Error('Data was empty')
  }
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
    walletAddress.address
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
