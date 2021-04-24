import { v4 as uuid } from 'uuid'

import { IlpAccountSettings } from '../../models'

import * as BalancesService from '../balances'
import { Balance } from '../balances'

// when are these accounts created?
const SETTLEMENT_ACCOUNT = 'settlementAccount'
const LIQUIDITY_ACCOUNT_PREFIX = 'liquidityAccount:'
BalancesService.createBalance({
  id: SETTLEMENT_ACCOUNT
})

interface IlpAccountBalance {
  assetCode: string
  assetScale: number

  max?: bigint
  min?: bigint
  current: bigint

  // details of how we implement this TBD
  parentAccountId?: string
}

export interface IlpAccountHttp {
  incomingTokens: string[]
  incomingEndpoint: string
  outgoingToken: string
  outgoingEndpoint: string
}

export interface IlpAccountStream {
  enabled: boolean
  suffix: string // read-only; ILP suffix for STREAM server receiving
}

export interface IlpAccountRouting {
  prefixes: string[] // prefixes that route to this account
  ilpAddress: string // ILP address for this account
}

export interface IlpAccount {
  id: string
  disabled: boolean // you can fetch config of disabled account but it will not process packets

  balance: IlpAccountBalance
  http?: IlpAccountHttp
  stream?: IlpAccountStream
  routing?: IlpAccountRouting
}

export type Transfer = {
  transferId: string

  sourceAccountId: string
  destinationAccountId: string

  sourceAmount?: bigint
  destinationAmount?: bigint
} & (
  | {
      sourceAmount: bigint
    }
  | {
      destinationAmount: bigint
    }
)

function toIlpAccountSettings(account: IlpAccount, balance: Balance) {
  return {
    id: account.id,
    disabled: account.disabled,
    assetCode: account.balance.assetCode,
    assetScale: account.balance.assetScale,
    balanceId: balance.id,
    parentAccountId: account.balance.parentAccountId,
    ...account.http,
    streamEnabled: account.stream && account.stream.enabled,
    streamSuffix: account.stream && account.stream.suffix,
    routingPrefixes: account.routing && account.routing.prefixes,
    ilpAddress: account.routing && account.routing.ilpAddress
  }
}

function toIlpAccount(
  accountSettings: IlpAccountSettings,
  balance: Balance
): IlpAccount {
  const account: IlpAccount = {
    id: accountSettings.id,
    disabled: accountSettings.disabled,
    balance: {
      assetCode: accountSettings.assetCode,
      assetScale: accountSettings.assetScale,
      current: balance.current
    }
  }
  if (accountSettings.parentAccountId) {
    account.balance.parentAccountId = accountSettings.parentAccountId
  }
  if (
    accountSettings.incomingTokens &&
    accountSettings.incomingEndpoint &&
    accountSettings.outgoingToken &&
    accountSettings.outgoingEndpoint
  ) {
    account.http = {
      incomingTokens: accountSettings.incomingTokens,
      incomingEndpoint: accountSettings.incomingEndpoint,
      outgoingToken: accountSettings.outgoingToken,
      outgoingEndpoint: accountSettings.outgoingEndpoint
    }
  }
  if (accountSettings.streamEnabled && accountSettings.streamSuffix) {
    account.stream = {
      enabled: accountSettings.streamEnabled,
      suffix: accountSettings.streamSuffix
    }
  }
  if (accountSettings.ilpAddress && accountSettings.routingPrefixes) {
    account.routing = {
      prefixes: accountSettings.routingPrefixes,
      ilpAddress: accountSettings.ilpAddress
    }
  }
  return account
}

export async function createAccount(account: IlpAccount): Promise<IlpAccount> {
  const balance = await BalancesService.createBalance({
    ...account.balance,
    id: uuid()
  })
  await IlpAccountSettings.query().insertAndFetch(
    toIlpAccountSettings(account, balance)
  )
  if (account.balance.current > BigInt(0)) {
    await BalancesService.createTransfer({
      id: uuid(),
      sourceBalanceId: SETTLEMENT_ACCOUNT,
      destinationBalanceId: balance.id,
      amount: account.balance.current
    })
  }
  return account
}

export async function getAccount(accountId: string): Promise<IlpAccount> {
  const accountSettings = await IlpAccountSettings.query().findById(accountId)
  const balance = await BalancesService.getBalance(accountSettings.balanceId)
  return toIlpAccount(accountSettings, balance)
}

// should this be replaced with updateAccountField(s)
// export async function updateAccount(account: IlpAccount): Promise<IlpAccount> {
//   return IlpAccountSettings.query().updateAndFetch(account)
// }

export async function createTransfer(transfer: Transfer): Promise<Transfer> {
  // use funds flow rules
  // look up asset details for each account to determine if liquidity accounts are involved
  const sourceAccountSettings = await IlpAccountSettings.query().findById(
    transfer.sourceAccountId
  )
  const destinationAccountSettings = await IlpAccountSettings.query().findById(
    transfer.destinationAccountId
  )
  if (
    sourceAccountSettings.assetCode === destinationAccountSettings.assetCode
  ) {
    if (
      transfer.sourceAmount &&
      transfer.destinationAmount &&
      transfer.sourceAmount !== transfer.destinationAmount
    ) {
      throw new Error('invalid transfer amounts')
    }
    await BalancesService.createTransfer({
      id: uuid(),
      sourceBalanceId: sourceAccountSettings.balanceId,
      destinationBalanceId: destinationAccountSettings.balanceId,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amount: transfer.sourceAmount || transfer.destinationAmount!
    })
  } else {
    if (!transfer.sourceAmount) {
      // rate backend?
    } else if (!transfer.destinationAmount) {
      // rate backend?
    }
    await BalancesService.createTransfer({
      id: uuid(),
      sourceBalanceId: sourceAccountSettings.balanceId,
      destinationBalanceId:
        LIQUIDITY_ACCOUNT_PREFIX + sourceAccountSettings.assetCode,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amount: transfer.sourceAmount!
    })
    await BalancesService.createTransfer({
      id: uuid(),
      sourceBalanceId:
        LIQUIDITY_ACCOUNT_PREFIX + destinationAccountSettings.assetCode,
      destinationBalanceId: destinationAccountSettings.balanceId,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      amount: transfer.destinationAmount!
    })
  }
  return transfer
}

// instead of void we might want to return liquidity account info
export async function depositLiquidity(
  currency: string,
  amount: bigint
): Promise<void> {
  await BalancesService.createTransfer({
    id: uuid(),
    sourceBalanceId: SETTLEMENT_ACCOUNT,
    destinationBalanceId: LIQUIDITY_ACCOUNT_PREFIX + currency,
    amount
  })
}

export async function withdrawLiquidity(
  currency: string,
  amount: bigint
): Promise<void> {
  await BalancesService.createTransfer({
    id: uuid(),
    sourceBalanceId: LIQUIDITY_ACCOUNT_PREFIX + currency,
    destinationBalanceId: SETTLEMENT_ACCOUNT,
    amount
  })
}

// we may return account instead of void from here
export async function deposit(
  accountId: string,
  amount: bigint
): Promise<void> {
  const accountSettings = await IlpAccountSettings.query().findById(accountId)
  await BalancesService.createTransfer({
    id: uuid(),
    sourceBalanceId: SETTLEMENT_ACCOUNT,
    destinationBalanceId: accountSettings.balanceId,
    amount
  })
}

export async function withdraw(
  accountId: string,
  amount: bigint
): Promise<void> {
  const accountSettings = await IlpAccountSettings.query().findById(accountId)
  await BalancesService.createTransfer({
    id: uuid(),
    sourceBalanceId: accountSettings.balanceId,
    destinationBalanceId: SETTLEMENT_ACCOUNT,
    amount
  })
}
