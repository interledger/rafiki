import { QueryBuilder, raw, transaction, UniqueViolationError } from 'objection'
import { Logger } from 'pino'
import { v4 as uuid } from 'uuid'
import {
  AccountFlags,
  Client,
  CommitFlags,
  CreateTransferError,
  Transfer as ClientTransfer,
  TransferFlags
} from 'tigerbeetle-node'

import { Config } from '../config'
import {
  InsufficientBalanceError,
  // InvalidAssetError,
  InvalidAmountError,
  UnknownAccountError,
  UnknownBalanceError
} from '../errors'
import { Account, Token } from '../models'
import {
  getNetBalance,
  toLiquidityId,
  toSettlementId,
  // toSettlementCreditId,
  // toSettlementLoanId,
  uuidToBigInt
} from '../utils'

// import { Errors } from 'ilp-packet'
import {
  AccountsService as ConnectorAccountsService,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transaction,
  Transfer
} from '../../core/services/accounts'
// const { InsufficientLiquidityError } = Errors

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
  // if (accountRow.parentAccountId) {
  //   account.parentAccountId = accountRow.parentAccountId
  // }
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
  // 'asset' | 'parentAccountId'
  'asset'
>
interface BalanceOptions {
  id: bigint
  flags: number
}

interface BalanceTransfer {
  sourceBalanceId: bigint
  destinationBalanceId: bigint
  amount: bigint
}

interface Peer {
  accountId: string
  ilpAddress: string
}

const ACCOUNT_RESERVED = Buffer.alloc(48)
const TRANSFER_RESERVED = Buffer.alloc(32)

export class AccountsService implements ConnectorAccountsService {
  constructor(
    private client: Client,
    private config: typeof Config,
    private logger: Logger
  ) {}

  public async createAccount(account: CreateOptions): Promise<IlpAccount> {
    await transaction(Account, Token, async (Account, Token) => {
      // if (account.parentAccountId) {
      //   const parentAccount = await Account.query()
      //     .findById(account.parentAccountId)
      //     .throwIfNotFound()
      //   if (
      //     account.asset.code !== parentAccount.assetCode ||
      //     account.asset.scale !== parentAccount.assetScale
      //   ) {
      //     throw new InvalidAssetError(account.asset.code, account.asset.scale)
      //   }
      //   if (!parentAccount.loanBalanceId || !parentAccount.creditBalanceId) {
      //     const loanBalanceId = uuid()
      //     const creditBalanceId = uuid()

      //     await this.createBalances(
      //       [
      //         {
      //           id: uuidToBigInt(loanBalanceId),
      //           flags:
      //             0 |
      //             AccountFlags.credits_must_not_exceed_debits |
      //             AccountFlags.linked
      //         },
      //         {
      //           id: uuidToBigInt(creditBalanceId),
      //           flags: 0 | AccountFlags.credits_must_not_exceed_debits
      //         }
      //       ],
      //       account.asset.scale
      //     )

      //     await Account.query()
      //       .patch({
      //         creditBalanceId,
      //         loanBalanceId
      //       })
      //       .findById(parentAccount.id)
      //       .throwIfNotFound()
      //   }
      // }

      const balanceId = uuid()
      // const debtBalanceId = uuid()
      // const trustlineBalanceId = uuid()
      await this.createBalances(
        [
          {
            id: uuidToBigInt(balanceId),
            //   flags:
            //     0 |
            //     AccountFlags.debits_must_not_exceed_credits |
            //     AccountFlags.linked
            // },
            // {
            //   id: uuidToBigInt(debtBalanceId),
            //   flags:
            //     0 |
            //     AccountFlags.debits_must_not_exceed_credits |
            //     AccountFlags.linked
            // },
            // {
            //   id: uuidToBigInt(trustlineBalanceId),
            flags: 0 | AccountFlags.debits_must_not_exceed_credits
          }
        ],
        account.asset.scale
      )
      await Account.query().insert({
        id: account.accountId,
        disabled: account.disabled,
        assetCode: account.asset.code,
        assetScale: account.asset.scale,
        balanceId,
        // debtBalanceId,
        // trustlineBalanceId,
        // parentAccountId: account.parentAccountId,
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

    // if (!account.parentAccountId) {
    await this.createCurrencyBalances(account.asset.code, account.asset.scale)
    // }
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
        'balanceId'
        // 'debtBalanceId',
        // 'trustlineBalanceId',
        // 'loanBalanceId',
        // 'creditBalanceId'
      )
      .throwIfNotFound()

    const balanceIds = [
      uuidToBigInt(account.balanceId)
      // uuidToBigInt(account.debtBalanceId),
      // uuidToBigInt(account.trustlineBalanceId)
    ]

    // if (account.loanBalanceId && account.creditBalanceId) {
    //   balanceIds.push(
    //     uuidToBigInt(account.loanBalanceId),
    //     uuidToBigInt(account.creditBalanceId)
    //   )
    // }

    const [
      balance
      // debtBalance,
      // trustlineBalance,
      // loanBalance,
      // creditBalance
    ] = await this.client.lookupAccounts(balanceIds)

    // if (!trustlineBalance) {
    //   throw new UnknownBalanceError()
    // }

    const accountBalance: IlpBalance = {
      id: accountId,
      balance: getNetBalance(balance)
      // parent: {
      //   availableCreditLine: getNetBalance(trustlineBalance),
      //   totalBorrowed: getNetBalance(debtBalance)
      // }
    }

    // if (loanBalance && creditBalance) {
    //   accountBalance.children = {
    //     availableCredit: getNetBalance(creditBalance),
    //     totalLent: getNetBalance(loanBalance)
    //   }
    // }

    return accountBalance
  }

  private async createCurrencyBalances(
    assetCode: string,
    assetScale: number
  ): Promise<void> {
    await this.createBalances(
      [
        {
          id: toLiquidityId(assetCode, assetScale),
          flags:
            0 |
            AccountFlags.debits_must_not_exceed_credits |
            AccountFlags.linked
        },
        {
          id: toSettlementId(assetCode, assetScale),
          //   flags:
          //     0 |
          //     AccountFlags.credits_must_not_exceed_debits |
          //     AccountFlags.linked
          // },
          // {
          //   id: toSettlementCreditId(assetCode, assetScale),
          //   flags:
          //     0 |
          //     AccountFlags.credits_must_not_exceed_debits |
          //     AccountFlags.linked
          // },
          // {
          //   id: toSettlementLoanId(assetCode, assetScale),
          flags: 0 | AccountFlags.credits_must_not_exceed_debits
        }
      ],
      assetScale
    )
  }

  private async createBalances(
    balances: BalanceOptions[],
    unit: number
  ): Promise<void> {
    await this.client.createAccounts(
      balances.map(({ id, flags }) => {
        return {
          id,
          user_data: BigInt(0),
          reserved: ACCOUNT_RESERVED,
          unit,
          code: 0,
          flags,
          debits_accepted: BigInt(0),
          debits_reserved: BigInt(0),
          credits_accepted: BigInt(0),
          credits_reserved: BigInt(0),
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
    await this.createTransfers([
      {
        sourceBalanceId: toSettlementId(assetCode, assetScale),
        destinationBalanceId: toLiquidityId(assetCode, assetScale),
        amount
      }
    ])
  }

  public async withdrawLiquidity(
    assetCode: string,
    assetScale: number,
    amount: bigint
  ): Promise<void> {
    await this.createTransfers([
      {
        sourceBalanceId: toLiquidityId(assetCode, assetScale),
        destinationBalanceId: toSettlementId(assetCode, assetScale),
        amount
      }
    ])
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

  private async createTransfers(transfers: BalanceTransfer[]): Promise<void> {
    const res = await this.client.createTransfers(
      transfers.map(({ sourceBalanceId, destinationBalanceId, amount }) => {
        return {
          id: uuidToBigInt(uuid()),
          debit_account_id: sourceBalanceId,
          credit_account_id: destinationBalanceId,
          amount,
          user_data: BigInt(0),
          reserved: TRANSFER_RESERVED,
          code: 0,
          flags: 0,
          timeout: BigInt(0),
          timestamp: BigInt(0)
        }
      })
    )
    for (const { code } of res) {
      if (
        [
          CreateTransferError.credit_account_not_found,
          CreateTransferError.debit_account_not_found
        ].includes(code)
      ) {
        throw new UnknownBalanceError()
      } else if (
        [
          CreateTransferError.exceeds_credits,
          CreateTransferError.exceeds_debits
        ].includes(code)
      ) {
        throw new InsufficientBalanceError()
      }
      // TODO handle other errors
    }
  }

  public async deposit(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId).throwIfNotFound()
    await this.createTransfers([
      {
        sourceBalanceId: toSettlementId(account.assetCode, account.assetScale),
        destinationBalanceId: uuidToBigInt(account.balanceId),
        amount
      }
    ])
  }

  public async withdraw(accountId: string, amount: bigint): Promise<void> {
    const account = await Account.query().findById(accountId).throwIfNotFound()
    await this.createTransfers([
      {
        sourceBalanceId: uuidToBigInt(account.balanceId),
        destinationBalanceId: toSettlementId(
          account.assetCode,
          account.assetScale
        ),
        amount
      }
    ])
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

  public async getAddress(accountId: string): Promise<string> {
    const { staticIlpAddress } = await Account.query()
      .findById(accountId)
      .select('staticIlpAddress')
      .throwIfNotFound()
    if (staticIlpAddress) {
      return staticIlpAddress
    }
    const idx = this.config.peerAddresses.findIndex(
      (peer: Peer) => peer.accountId === accountId
    )
    if (idx !== -1) {
      return this.config.peerAddresses[idx].ilpAddress
    }
    return this.config.ilpAddress + '.' + accountId
  }

  public async transferFunds(transfer: Transfer): Promise<Transfer> {
    const {
      sourceAccountId,
      destinationAccountId,
      sourceAmount,
      destinationAmount,
      callback
    } = transfer
    const [
      sourceAccount,
      destinationAccount
    ] = await Account.query()
      .findByIds([sourceAccountId, destinationAccountId])
      .throwIfNotFound()
    if (!sourceAccount || !destinationAccount) {
      throw new UnknownAccountError()
    }

    const transfers: ClientTransfer[] = []

    const flags = callback ? 0 | TransferFlags.two_phase_commit : 0
    const timeout = callback ? BigInt(1000000000) : BigInt(0)

    if (sourceAccount.assetCode === destinationAccount.assetCode) {
      if (
        sourceAmount &&
        destinationAmount &&
        sourceAmount !== destinationAmount
      ) {
        throw new InvalidAmountError()
      }
      transfers.push({
        id: uuidToBigInt(uuid()),
        debit_account_id: uuidToBigInt(sourceAccount.balanceId),
        credit_account_id: uuidToBigInt(destinationAccount.balanceId),
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        amount: sourceAmount || destinationAmount!,
        flags,
        timeout,
        reserved: TRANSFER_RESERVED,
        code: 0,
        user_data: BigInt(0),
        timestamp: BigInt(0)
      })
    } else {
      if (!sourceAmount) {
        // TODO rate backend
      } else if (!destinationAmount) {
        // TODO rate backend
      }

      transfers.push(
        {
          id: uuidToBigInt(uuid()),
          debit_account_id: uuidToBigInt(sourceAccount.balanceId),
          credit_account_id: toLiquidityId(
            sourceAccount.assetCode,
            sourceAccount.assetScale
          ),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          amount: sourceAmount!,
          flags: flags | TransferFlags.linked,
          timeout,
          reserved: TRANSFER_RESERVED,
          code: 0,
          user_data: BigInt(0),
          timestamp: BigInt(0)
        },
        {
          id: uuidToBigInt(uuid()),
          debit_account_id: toLiquidityId(
            destinationAccount.assetCode,
            destinationAccount.assetScale
          ),
          credit_account_id: uuidToBigInt(destinationAccount.balanceId),
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          amount: destinationAmount!,
          flags,
          timeout,
          reserved: TRANSFER_RESERVED,
          code: 0,
          user_data: BigInt(0),
          timestamp: BigInt(0)
        }
      )
    }
    try {
      const res = await this.client.createTransfers(transfers)
      for (const { code } of res) {
        if (
          [
            CreateTransferError.credit_account_not_found,
            CreateTransferError.debit_account_not_found
          ].includes(code)
        ) {
          throw new UnknownBalanceError()
        } else if (
          [
            CreateTransferError.exceeds_credits,
            CreateTransferError.exceeds_debits
          ].includes(code)
        ) {
          throw new InsufficientBalanceError()
        }
        // TODO handle other errors
      }
      if (callback) {
        const tx: Transaction = {
          commit: async () => {
            const res = await this.client.commitTransfers(
              transfers.map((transfer) => {
                return {
                  id: transfer.id,
                  flags:
                    transfer.flags & TransferFlags.linked
                      ? 0 | CommitFlags.linked
                      : 0,
                  reserved: TRANSFER_RESERVED,
                  code: 0,
                  timestamp: BigInt(0)
                }
              })
            )
            if (res.length) {
              // TODO throw
            }
          },
          rollback: async () => {
            const res = await this.client.commitTransfers(
              transfers.map((transfer) => {
                const flags =
                  transfer.flags & TransferFlags.linked
                    ? 0 | CommitFlags.linked
                    : 0
                return {
                  id: transfer.id,
                  flags: flags | CommitFlags.reject,
                  reserved: TRANSFER_RESERVED,
                  code: 0,
                  timestamp: BigInt(0)
                }
              })
            )
            if (res.length) {
              // TODO throw
            }
          }
        }
        await callback(tx)
      }
      return transfer
    } catch (error) {
      this.logger.error({
        error
      })
      // Should this rethrow the error?
      throw error
    }
  }
}
