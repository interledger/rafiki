import { QueryBuilder, transaction, UniqueViolationError } from 'objection'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'
import { Client, CommitFlags, CreateTransferFlags } from 'tigerbeetle-node'

import { Account, Token } from '../models'
import { BalanceIds } from '../types'
import {
  getNetBalance,
  toLiquidityIds,
  toSettlementIds,
  uuidToBigInt
} from '../utils'

import { AccountNotFoundError } from '../../core/errors'
// import { Errors } from 'ilp-packet'
import {
  AccountsService as ConnectorAccountsService,
  AdjustmentOptions,
  IlpAccount,
  IlpBalance,
  Transaction
} from '../../core/services/accounts'
// const { InsufficientLiquidityError } = Errors

const CUSTOM_FIELDS = {
  custom_1: BigInt(0),
  custom_2: BigInt(0),
  custom_3: BigInt(0)
}

export interface BalanceOptions extends BalanceIds {
  unit: bigint
}

function toIlpAccount(accountRow: Account): IlpAccount {
  const account: IlpAccount = {
    accountId: accountRow.id,
    disabled: accountRow.disabled,
    asset: {
      code: accountRow.assetCode,
      scale: accountRow.assetScale
    },
    parentAccountId: accountRow.parentAccountId,
    maxPacketAmount: accountRow.maxPacketAmount
  }
  if (
    accountRow.incomingTokens &&
    accountRow.incomingEndpoint &&
    accountRow.outgoingToken &&
    accountRow.outgoingEndpoint
  ) {
    account.http = {
      incoming: {
        authTokens: accountRow.incomingTokens.map(
          (incomingToken) => incomingToken.token
        ),
        endpoint: accountRow.incomingEndpoint
      },
      outgoing: {
        authToken: accountRow.outgoingToken,
        endpoint: accountRow.outgoingEndpoint
      }
    }
  }
  if (accountRow.streamEnabled) {
    account.stream = {
      enabled: accountRow.streamEnabled
    }
  }
  if (accountRow.staticIlpAddress) {
    account.routing = {
      staticIlpAddress: accountRow.staticIlpAddress
    }
  }
  return account
}

function toAccountRow(
  account: IlpAccount,
  balanceId: string,
  debtBalanceId: string,
  trustlineBalanceId: string
) {
  return {
    id: account.accountId,
    disabled: account.disabled,
    assetCode: account.asset.code,
    assetScale: account.asset.scale,
    balanceId,
    debtBalanceId,
    trustlineBalanceId,
    parentAccountId: account.parentAccountId,
    maxPacketAmount: account.maxPacketAmount,
    incomingEndpoint: account.http && account.http.incoming.endpoint,
    outgoingToken: account.http && account.http.outgoing.authToken,
    outgoingEndpoint: account.http && account.http.outgoing.endpoint,
    streamEnabled: account.stream && account.stream.enabled,
    staticIlpAddress: account.routing && account.routing.staticIlpAddress
  }
}

export class AccountsService implements ConnectorAccountsService {
  async getAccountByDestinationAddress(
    _destinationAddress: string
  ): Promise<IlpAccount> {
    throw new Error('unimplemented')
  }

  constructor(private client: Client, private logger: Logger) {}

  public async adjustBalances({
    sourceAmount,
    sourceAccountId,
    destinationAccountId,
    callback
  }: AdjustmentOptions): Promise<void> {
    const [sourceAccount, destinationAccount] = await Account.query().findByIds([
      sourceAccountId,
      destinationAccountId
    ])
    if (sourceAmount > BigInt(0)) {
      const sourceTransferId = uuidToBigInt(uuid())
      const destinationTransferId = uuidToBigInt(uuid())
      const tx: Transaction = {
        commit: async () => {
          const res = await this.client.commitTransfers([
            {
              id: sourceTransferId,
              flags: 0n | BigInt(CommitFlags.accept),
              ...CUSTOM_FIELDS
            },
            {
              id: destinationTransferId,
              flags: 0n | BigInt(CommitFlags.accept),
              ...CUSTOM_FIELDS
            }
          ])
          if (res.length) {
            // throw
          }
        },
        rollback: async () => {
          const res = await this.client.commitTransfers([
            {
              id: sourceTransferId,
              flags: 0n | BigInt(CommitFlags.reject),
              ...CUSTOM_FIELDS
            },
            {
              id: destinationTransferId,
              flags: 0n | BigInt(CommitFlags.reject),
              ...CUSTOM_FIELDS
            }
          ])
          if (res.length) {
            // throw
          }
        }
      }

      try {
        const res = await this.client.createTransfers([
          {
            id: sourceTransferId,
            debit_account_id: uuidToBigInt(sourceAccount.balanceId),
            credit_account_id: toLiquidityIds(
              sourceAccount.assetCode,
              sourceAccount.assetScale
            ).id,
            amount: sourceAmount,
            ...CUSTOM_FIELDS,
            flags: BigInt(0),
            timeout: BigInt(1000000000)
          },
          {
            id: destinationTransferId,
            debit_account_id: toLiquidityIds(
              destinationAccount.assetCode,
              destinationAccount.assetScale
            ).id,
            credit_account_id: uuidToBigInt(destinationAccount.balanceId),
            amount: sourceAmount,
            ...CUSTOM_FIELDS,
            flags: BigInt(0),
            timeout: BigInt(1000000000)
          }
        ])
        if (res.length) {
          // throw new InsufficientLiquidityError()
        }

        await callback(tx)
      } catch (error) {
        // Should this rethrow the error?
        throw error(error)
      }
    }
  }

  public async createAccount(account: IlpAccount): Promise<IlpAccount> {
    const balanceId = uuid()
    const debtBalanceId = uuid()
    const trustlineBalanceId = uuid()
    await this.createBalances({
      id: uuidToBigInt(balanceId),
      debtId: uuidToBigInt(debtBalanceId),
      trustlineId: uuidToBigInt(trustlineBalanceId),
      unit: BigInt(account.asset.scale)
    })
    await transaction(Account, Token, async (Account, Token) => {
      await Account.query().insert(
        toAccountRow(account, balanceId, debtBalanceId, trustlineBalanceId)
      )

      if (account.http) {
        try {
          const incomingTokens = account.http.incoming.authTokens.map(
            (incomingToken) => {
              return {
                accountId: account.accountId,
                token: incomingToken
              }
            }
          )
          await Token.query().insert(incomingTokens)
        } catch (error) {
          if (error instanceof UniqueViolationError) {
            this.logger.info({
              msg: 'duplicate incoming token attempted to be added',
              account
            })
          }
          throw error
        }
      }
    })

    await this.createCurrencyBalances(account.asset.code, account.asset.scale)
    return account
  }

  public async getAccount(accountId: string): Promise<IlpAccount> {
    const accountRow = await Account.query()
      .withGraphJoined('incomingTokens(selectIncomingToken)')
      .modifiers({
        selectIncomingToken(builder: QueryBuilder<Token, Token[]>) {
          builder.select('token')
        }
      })
      .findById(accountId)
    return toIlpAccount(accountRow)
  }

  public async getAccountBalance(accountId: string): Promise<IlpBalance> {
    const account = await Account.query()
      .withGraphJoined('incomingTokens(selectIncomingToken)')
      .modifiers({
        selectIncomingToken(builder: QueryBuilder<Token, Token[]>) {
          builder.select('token')
        }
      })
      .findById(accountId)
    const [
      balance,
      debtBalance,
      trustlineBalance
    ] = await this.client.lookupAccounts([
      uuidToBigInt(account.balanceId),
      uuidToBigInt(account.debtBalanceId),
      uuidToBigInt(account.trustlineBalanceId)
    ])

    if (!trustlineBalance) {
      throw new AccountNotFoundError(accountId)
    }

    return {
      id: accountId,
      balance: getNetBalance(balance),
      // children: {
      //   availableCredit: bigint
      //   totalLent: bigint
      // },
      parent: {
        availableCreditLine: getNetBalance(trustlineBalance),
        totalBorrowed: getNetBalance(debtBalance)
      }
    }
  }

  private async createCurrencyBalances(
    assetCode: string,
    assetScale: number
  ): Promise<void> {
    await this.createBalances({
      ...toSettlementIds(assetCode, assetScale),
      unit: BigInt(assetScale)
    })
    await this.createBalances({
      ...toLiquidityIds(assetCode, assetScale),
      unit: BigInt(assetScale)
    })
  }

  private async createBalances({
    id,
    debtId,
    trustlineId,
    unit
  }: BalanceOptions): Promise<void> {
    await this.client.createAccounts([
      {
        id,
        custom: BigInt(0),
        flags: BigInt(0),
        unit,
        debit_accepted: BigInt(0),
        debit_reserved: BigInt(0),
        credit_accepted: BigInt(0),
        credit_reserved: BigInt(0),
        debit_accepted_limit: BigInt(0),
        debit_reserved_limit: BigInt(0),
        credit_accepted_limit: BigInt(0),
        credit_reserved_limit: BigInt(0),
        timestamp: 0n
      },
      {
        id: debtId,
        custom: BigInt(0),
        flags: BigInt(0),
        unit,
        debit_accepted: BigInt(0),
        debit_reserved: BigInt(0),
        credit_accepted: BigInt(0),
        credit_reserved: BigInt(0),
        debit_accepted_limit: BigInt(0),
        debit_reserved_limit: BigInt(0),
        credit_accepted_limit: BigInt(0),
        credit_reserved_limit: BigInt(0),
        timestamp: 0n
      },
      {
        id: trustlineId,
        custom: BigInt(0),
        flags: BigInt(0),
        unit,
        debit_accepted: BigInt(0),
        debit_reserved: BigInt(0),
        credit_accepted: BigInt(0),
        credit_reserved: BigInt(0),
        debit_accepted_limit: BigInt(0),
        debit_reserved_limit: BigInt(0),
        credit_accepted_limit: BigInt(0),
        credit_reserved_limit: BigInt(0),
        timestamp: 0n
      }
    ])
  }

  public async depositLiquidity(
    assetCode: string,
    assetScale: number,
    amount: bigint
  ): Promise<void> {
    await this.createCurrencyBalances(assetCode, assetScale)
    await this.createTransfer(
      toSettlementIds(assetCode, assetScale).id,
      toLiquidityIds(assetCode, assetScale).id,
      amount
    )
  }

  public async withdrawLiquidity(
    assetCode: string,
    assetScale: number,
    amount: bigint
  ): Promise<void> {
    await this.createCurrencyBalances(assetCode, assetScale)
    await this.createTransfer(
      toLiquidityIds(assetCode, assetScale).id,
      toSettlementIds(assetCode, assetScale).id,
      amount
    )
  }

  public async getLiquidityBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint> {
    return this.getBalance(toLiquidityIds(assetCode, assetScale).id)
  }

  public async getSettlementBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint> {
    return this.getBalance(toSettlementIds(assetCode, assetScale).id)
  }

  private async getBalance(id: bigint): Promise<bigint> {
    const balances = await this.client.lookupAccounts([id])
    if (balances.length == 1) {
      return getNetBalance(balances[0])
    }
    return BigInt(0)
  }

  private async createTransfer(
    sourceBalanceId: bigint,
    destinationBalanceId: bigint,
    amount: bigint
  ): Promise<void> {
    await this.client.createTransfers([
      {
        id: uuidToBigInt(uuid()),
        debit_account_id: sourceBalanceId,
        credit_account_id: destinationBalanceId,
        amount,
        ...CUSTOM_FIELDS,
        flags:
          0n |
          BigInt(CreateTransferFlags.auto_commit) |
          BigInt(CreateTransferFlags.accept),
        timeout: BigInt(0)
      }
    ])
    // check for error
  }

  public async deposit(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId)
    if (!account) {
      throw new AccountNotFoundError(accountId)
    }
    await this.createTransfer(
      toSettlementIds(account.assetCode, account.assetScale).id,
      uuidToBigInt(account.balanceId),
      amount
    )
  }

  public async withdraw(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId)
    if (!account) {
      throw new AccountNotFoundError(accountId)
    }
    await this.createTransfer(
      uuidToBigInt(account.balanceId),
      toSettlementIds(account.assetCode, account.assetScale).id,
      amount
    )
  }

  public async getAccountByToken(
    token: string
  ): Promise<IlpAccount | null> {
    const account = await Account.query()
      .select('accounts.id', 'accounts.assetCode', 'accounts.assetScale')
      .withGraphJoined('incomingTokens')
      .where('incomingTokens.token', token)
      .first()
    return account ? toIlpAccount(account) : null
  }
}
