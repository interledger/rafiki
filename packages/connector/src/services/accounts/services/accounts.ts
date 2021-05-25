import { QueryBuilder, raw, transaction, UniqueViolationError } from 'objection'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'
import {
  Client,
  CommitFlags,
  CreateTransferError,
  CreateTransferFlags
} from 'tigerbeetle-node'

import { Config } from '../config'
import {
  InvalidAssetError,
  UnknownAccountError,
  UnknownBalanceError
} from '../errors'
import { Account, Token } from '../models'
import {
  getNetBalance,
  toLiquidityId,
  toSettlementId,
  toSettlementCreditId,
  toSettlementLoanId,
  uuidToBigInt
} from '../utils'

// import { Errors } from 'ilp-packet'
import {
  AccountsService as ConnectorAccountsService,
  AdjustmentOptions,
  CreateOptions,
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
  if (accountRow.outgoingToken && accountRow.outgoingEndpoint) {
    account.http = {
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

export type UpdateIlpAccountOptions = Omit<
  CreateOptions,
  'asset' | 'parentAccountId'
>

interface Peer {
  accountId: string
  ilpAddress: string
}

export class AccountsService implements ConnectorAccountsService {
  constructor(
    private client: Client,
    private config: typeof Config,
    private logger: Logger
  ) {}

  public async adjustBalances({
    sourceAmount,
    sourceAccountId,
    destinationAccountId,
    callback
  }: AdjustmentOptions): Promise<void> {
    const [sourceAccount, destinationAccount] = await Account.query()
      .findByIds([sourceAccountId, destinationAccountId])
      .throwIfNotFound()
    if (!sourceAccount || !destinationAccount) {
      throw new UnknownAccountError()
    }
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
          if (
            [
              CreateTransferError.credit_account_not_found,
              CreateTransferError.debit_account_not_found
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            ].includes((res[0] as any).result)
          ) {
            console.log('UnknownBalanceError')
            throw new UnknownBalanceError()
          }
          // TODO handle other errors
        }
        await callback(tx)
      } catch (error) {
        this.logger.error({
          error
        })
        // Should this rethrow the error?
        throw error
      }
    }
  }

  public async createAccount(account: CreateOptions): Promise<IlpAccount> {
    await transaction(Account, Token, async (Account, Token) => {
      if (account.parentAccountId) {
        const parentAccount = await Account.query()
          .findById(account.parentAccountId)
          .throwIfNotFound()
        if (
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
            .throwIfNotFound()
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

      try {
        const incomingTokens = account.http?.incoming?.authTokens.map(
          (incomingToken) => {
            return {
              accountId: account.accountId,
              token: incomingToken
            }
          }
        )
        if (incomingTokens) {
          await Token.query().insert(incomingTokens)
        }
      } catch (error) {
        if (error instanceof UniqueViolationError) {
          this.logger.info({
            msg: 'duplicate incoming token attempted to be added',
            account
          })
        }
        throw error
      }
    })

    if (!account.parentAccountId) {
      await this.createCurrencyBalances(account.asset.code, account.asset.scale)
    }
    return this.getAccount(account.accountId)
  }

  public async updateAccount(
    accountOptions: UpdateIlpAccountOptions
  ): Promise<IlpAccount> {
    return transaction(Account, Token, async (Account, Token) => {
      if (accountOptions.http?.incoming?.authTokens) {
        await Token.query().delete().where({
          accountId: accountOptions.accountId
        })
        try {
          const incomingTokens = accountOptions.http.incoming.authTokens.map(
            (incomingToken) => {
              return {
                accountId: accountOptions.accountId,
                token: incomingToken
              }
            }
          )
          await Token.query().insert(incomingTokens)
        } catch (error) {
          if (error instanceof UniqueViolationError) {
            this.logger.info({
              msg: 'duplicate incoming token attempted to be added',
              accountOptions
            })
          }
          throw error
        }
      }
      const account = await Account.query()
        .patchAndFetchById(accountOptions.accountId, {
          disabled: accountOptions.disabled,
          maxPacketAmount: accountOptions.maxPacketAmount,
          outgoingEndpoint: accountOptions.http?.outgoing.endpoint,
          outgoingToken: accountOptions.http?.outgoing.authToken,
          streamEnabled: accountOptions.stream?.enabled
        })
        .throwIfNotFound()
      if (accountOptions.http?.incoming?.authTokens) {
        account.incomingTokens = accountOptions.http.incoming.authTokens.map(
          (incomingToken) => {
            return {
              accountId: accountOptions.accountId,
              token: incomingToken
            } as Token
          }
        )
      }
      return toIlpAccount(account)
    })
  }

  public async getAccount(accountId: string): Promise<IlpAccount> {
    const accountRow = await Account.query()
      .findById(accountId)
      .throwIfNotFound()
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
      .throwIfNotFound()

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
      throw new UnknownBalanceError()
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
    if (balances.length !== 1) {
      throw new UnknownBalanceError()
    }
    return getNetBalance(balances[0])
  }

  private async createTransfer(
    sourceBalanceId: bigint,
    destinationBalanceId: bigint,
    amount: bigint
  ): Promise<void> {
    const res = await this.client.createTransfers([
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

    if (res.length) {
      if (
        [
          CreateTransferError.credit_account_not_found,
          CreateTransferError.debit_account_not_found
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ].includes((res[0] as any).result)
      ) {
        console.log('UnknownBalanceError')
        throw new UnknownBalanceError()
      }
      // TODO handle other errors
    }
  }

  public async deposit(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId).throwIfNotFound()
    await this.createTransfer(
      toSettlementId(account.assetCode, account.assetScale),
      uuidToBigInt(account.balanceId),
      amount
    )
  }

  public async withdraw(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId).throwIfNotFound()
    await this.createTransfer(
      uuidToBigInt(account.balanceId),
      toSettlementId(account.assetCode, account.assetScale),
      amount
    )
  }

  public async getAccountByToken(token: string): Promise<IlpAccount | null> {
    const account = await Account.query()
      .withGraphJoined('incomingTokens')
      .where('incomingTokens.token', token)
      .first()
    return account ? toIlpAccount(account) : null
  }

  public async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | null> {
    try {
      const account = await Account.query()
        // new RegExp('^' + staticIlpAddress + '($|\\.)'))
        .where(
          raw('?', [destinationAddress]),
          'like',
          raw("?? || '%'", ['staticIlpAddress'])
        )
        .andWhere((builder) => {
          builder
            .where(
              raw('length(??)', ['staticIlpAddress']),
              destinationAddress.length
            )
            .orWhere(
              raw('substring(?, length(??)+1, 1)', [
                destinationAddress,
                'staticIlpAddress'
              ]),
              '.'
            )
        })
        .first()
      if (account) {
        return toIlpAccount(account)
      }
      const idx = this.config.peerAddresses.findIndex((peer: Peer) =>
        new RegExp('^' + peer.ilpAddress + '($|\\.)').test(destinationAddress)
      )
      if (idx !== -1) {
        const account = await Account.query().findById(
          this.config.peerAddresses[idx].accountId
        )
        if (account) {
          return toIlpAccount(account)
        }
      }
      const found = destinationAddress.match(
        new RegExp(
          '(?<=^' + this.config.ilpAddress + '\\.)([a-zA-Z0-9_~-]+)(?=($|[.]))'
        )
      )
      if (found) {
        const account = await Account.query().findById(found[0])
        if (account) {
          return toIlpAccount(account)
        }
      }
      return null
    } catch {
      return null
    }
  }
}
