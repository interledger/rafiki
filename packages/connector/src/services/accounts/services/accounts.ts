import { QueryBuilder, transaction, UniqueViolationError } from 'objection'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'
import { Client, CommitFlags, CreateTransferFlags } from 'tigerbeetle-node'

import { InvalidAssetError } from '../errors'
import { Account, Token } from '../models'
import {
  getNetBalance,
  toLiquidityId,
  toSettlementId,
  toSettlementCreditId,
  toSettlementLoanId,
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

function toIlpAccount(accountRow: Account): IlpAccount {
  const account: IlpAccount = {
    accountId: accountRow.id,
    disabled: accountRow.disabled,
    asset: {
      code: accountRow.assetCode,
      scale: accountRow.assetScale
    },
    maxPacketAmount: accountRow.maxPacketAmount,
    stream: {
      enabled: accountRow.streamEnabled
    }
  }
  if (accountRow.parentAccountId) {
    account.parentAccountId = accountRow.parentAccountId
  }
  if (
    accountRow.incomingTokens &&
    accountRow.outgoingToken &&
    accountRow.outgoingEndpoint
  ) {
    account.http = {
      incoming: {
        authTokens: accountRow.incomingTokens.map(
          (incomingToken) => incomingToken.token
        ),
      },
      outgoing: {
        authToken: accountRow.outgoingToken,
        endpoint: accountRow.outgoingEndpoint
      }
    }
  }
  if (accountRow.staticIlpAddress) {
    account.routing = {
      staticIlpAddress: accountRow.staticIlpAddress
    }
  }
  return account
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
            credit_account_id: toLiquidityId(
              sourceAccount.assetCode,
              sourceAccount.assetScale
            ),
            amount: sourceAmount,
            ...CUSTOM_FIELDS,
            flags: BigInt(0),
            timeout: BigInt(1000000000)
          },
          {
            id: destinationTransferId,
            debit_account_id: toLiquidityId(
              destinationAccount.assetCode,
              destinationAccount.assetScale
            ),
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

  public async createAccount(
    account: IlpAccount
  ): Promise<IlpAccount> {
    await transaction(Account, Token, async (Account, Token) => {
      if (account.parentAccountId) {
        const parentAccount = await Account.query().findById(
          account.parentAccountId
        )
        if (!parentAccount) {
          throw new AccountNotFoundError(account.parentAccountId)
        } else if (
          account.asset.code !== parentAccount.assetCode ||
          account.asset.scale !== parentAccount.assetScale
        ) {
          throw new InvalidAssetError(account.asset.code, account.asset.scale)
        }
        if (!parentAccount.loanBalanceId || !parentAccount.creditBalanceId) {
          const loanBalanceId = uuid()
          const creditBalanceId = uuid()

          await this.createBalances(
            [uuidToBigInt(loanBalanceId), uuidToBigInt(creditBalanceId)],
            BigInt(account.asset.scale)
          )

          await Account.query()
            .patch({
              creditBalanceId,
              loanBalanceId
            })
            .findById(parentAccount.id)
        }
      }

      const balanceId = uuid()
      const debtBalanceId = uuid()
      const trustlineBalanceId = uuid()
      await this.createBalances(
        [
          uuidToBigInt(balanceId),
          uuidToBigInt(debtBalanceId),
          uuidToBigInt(trustlineBalanceId)
        ],
        BigInt(account.asset.scale)
      )
      await Account.query().insert({
        id: account.accountId,
        disabled: account.disabled,
        assetCode: account.asset.code,
        assetScale: account.asset.scale,
        balanceId,
        debtBalanceId,
        trustlineBalanceId,
        parentAccountId: account.parentAccountId,
        maxPacketAmount: account.maxPacketAmount,
        outgoingEndpoint: account.http?.outgoing.endpoint,
        outgoingToken: account.http?.outgoing.authToken,
        streamEnabled: account.stream?.enabled,
        staticIlpAddress: account.routing?.staticIlpAddress
      })

      if (account.http?.incoming.authTokens) {
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

    if (!account.parentAccountId) {
      await this.createCurrencyBalances(account.asset.code, account.asset.scale)
    }
    return this.getAccount(account.accountId)
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
      .select(
        'balanceId',
        'debtBalanceId',
        'trustlineBalanceId',
        'loanBalanceId',
        'creditBalanceId'
      )

    const balanceIds = [
      uuidToBigInt(account.balanceId),
      uuidToBigInt(account.debtBalanceId),
      uuidToBigInt(account.trustlineBalanceId)
    ]

    if (account.loanBalanceId && account.creditBalanceId) {
      balanceIds.push(
        uuidToBigInt(account.loanBalanceId),
        uuidToBigInt(account.creditBalanceId)
      )
    }

    const [
      balance,
      debtBalance,
      trustlineBalance,
      loanBalance,
      creditBalance
    ] = await this.client.lookupAccounts(balanceIds)

    if (!trustlineBalance) {
      throw new AccountNotFoundError(accountId)
    }

    const accountBalance: IlpBalance = {
      id: accountId,
      balance: getNetBalance(balance),
      parent: {
        availableCreditLine: getNetBalance(trustlineBalance),
        totalBorrowed: getNetBalance(debtBalance)
      }
    }

    if (loanBalance && creditBalance) {
      accountBalance.children = {
        availableCredit: getNetBalance(creditBalance),
        totalLent: getNetBalance(loanBalance)
      }
    }

    return accountBalance
  }

  private async createCurrencyBalances(
    assetCode: string,
    assetScale: number
  ): Promise<void> {
    await this.createBalances(
      [
        toLiquidityId(assetCode, assetScale),
        toSettlementId(assetCode, assetScale),
        toSettlementCreditId(assetCode, assetScale),
        toSettlementLoanId(assetCode, assetScale)
      ],
      BigInt(assetScale)
    )
  }

  private async createBalances(ids: bigint[], unit: bigint): Promise<void> {
    await this.client.createAccounts(
      ids.map((id) => {
        return {
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
        }
      })
    )
  }

  public async depositLiquidity(
    assetCode: string,
    assetScale: number,
    amount: bigint
  ): Promise<void> {
    await this.createCurrencyBalances(assetCode, assetScale)
    await this.createTransfer(
      toSettlementId(assetCode, assetScale),
      toLiquidityId(assetCode, assetScale),
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
      toLiquidityId(assetCode, assetScale),
      toSettlementId(assetCode, assetScale),
      amount
    )
  }

  public async getLiquidityBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint> {
    return this.getBalance(toLiquidityId(assetCode, assetScale))
  }

  public async getSettlementBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint> {
    return this.getBalance(toSettlementId(assetCode, assetScale))
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
      toSettlementId(account.assetCode, account.assetScale),
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
      toSettlementId(account.assetCode, account.assetScale),
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
