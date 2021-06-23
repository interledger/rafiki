import {
  NotFoundError,
  raw,
  transaction,
  UniqueViolationError
} from 'objection'
import { Logger } from 'pino'
import * as uuid from 'uuid'
import {
  AccountFlags,
  Client,
  CommitFlags,
  CommitTransferError,
  CreateTransferError,
  Transfer as ClientTransfer,
  TransferFlags
} from 'tigerbeetle-node'

import { Config } from '../config'
import {
  // InvalidAssetError,
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError,
  UnknownSettlementAccountError
} from '../errors'
import { IlpAccount as IlpAccountModel, IlpHttpToken } from '../models'
import {
  calculateCreditBalance,
  calculateDebitBalance,
  toLiquidityId,
  toSettlementId,
  // toSettlementCreditId,
  // toSettlementLoanId,
  randomId
} from '../utils'
import {
  AccountsService as ConnectorAccountsService,
  CreateAccountError,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transaction,
  Transfer,
  TransferError
} from '../../core/services/accounts'

function toIlpAccount(accountRow: IlpAccountModel): IlpAccount {
  const account: IlpAccount = {
    accountId: accountRow.id,
    disabled: accountRow.disabled,
    asset: {
      code: accountRow.assetCode,
      scale: accountRow.assetScale
    },
    stream: {
      enabled: accountRow.streamEnabled
    }
  }
  if (accountRow.maxPacketAmount) {
    account.maxPacketAmount = accountRow.maxPacketAmount
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

export enum UpdateAccountError {
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  UnknownAccount = 'UnknownAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isUpdateAccountError = (o: any): o is UpdateAccountError =>
  Object.values(UpdateAccountError).includes(o)

export enum DepositError {
  DepositExists = 'DepositExists',
  UnknownAccount = 'UnknownAccount'
}

export enum WithdrawError {
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InsufficientSettlementBalance = 'InsufficientSettlementBalance',
  UnknownAccount = 'UnknownAccount',
  UnknownLiquidityAccount = 'UnknownLiquidityAccount',
  UnknownSettlementAccount = 'UnknownSettlementAccount',
  WithdrawalExists = 'WithdrawalExists'
}

interface BalanceOptions {
  id: bigint
  flags: number
}

interface BalanceTransfer {
  transferId?: bigint
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

const UUID_LENGTH = 36

export class AccountsService implements ConnectorAccountsService {
  constructor(
    private client: Client,
    private config: typeof Config,
    private logger: Logger
  ) {}

  public async createAccount(
    account: CreateOptions
  ): Promise<IlpAccount | CreateAccountError> {
    try {
      return await transaction(
        IlpAccountModel,
        IlpHttpToken,
        async (IlpAccountModel, IlpHttpToken) => {
          // if (account.parentAccountId) {
          //   const parentAccount = await IlpAccountModel.query()
          //     .findById(account.parentAccountId)
          //     .throwIfNotFound()
          //   if (
          //     account.asset.code !== parentAccount.assetCode ||
          //     account.asset.scale !== parentAccount.assetScale
          //   ) {
          //     throw new InvalidAssetError(account.asset.code, account.asset.scale)
          //   }
          //   if (!parentAccount.loanBalanceId || !parentAccount.creditBalanceId) {
          //     const loanBalanceId = uuid.v4()
          //     const creditBalanceId = uuid.v4()

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

          //     await IlpAccountModel.query()
          //       .patch({
          //         creditBalanceId,
          //         loanBalanceId
          //       })
          //       .findById(parentAccount.id)
          //       .throwIfNotFound()
          //   }
          // }

          const balanceId = randomId()
          // const debtBalanceId = uuid.v4()
          // const trustlineBalanceId = uuid.v4()
          await this.createBalances(
            [
              {
                id: balanceId,
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
          const accountRow = await IlpAccountModel.query().insertAndFetch({
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

          const incomingTokens = account.http?.incoming?.authTokens.map(
            (incomingToken) => {
              return {
                accountId: account.accountId,
                token: incomingToken
              }
            }
          )
          if (incomingTokens) {
            await IlpHttpToken.query().insert(incomingTokens)
          }

          // if (!account.parentAccountId) {
          await this.createCurrencyBalances(
            account.asset.code,
            account.asset.scale
          )
          // }
          return toIlpAccount(accountRow)
        }
      )
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        switch (err.constraint) {
          case 'ilpAccounts_pkey':
            return CreateAccountError.DuplicateAccountId
          case 'ilphttptokens_token_unique':
            return CreateAccountError.DuplicateIncomingToken
        }
      }
      throw err
    }
  }

  public async updateAccount(
    accountOptions: UpdateIlpAccountOptions
  ): Promise<IlpAccount | UpdateAccountError> {
    try {
      return await transaction(
        IlpAccountModel,
        IlpHttpToken,
        async (IlpAccountModel, IlpHttpToken) => {
          if (accountOptions.http?.incoming?.authTokens) {
            await IlpHttpToken.query().delete().where({
              accountId: accountOptions.accountId
            })
            const incomingTokens = accountOptions.http.incoming.authTokens.map(
              (incomingToken) => {
                return {
                  accountId: accountOptions.accountId,
                  token: incomingToken
                }
              }
            )
            await IlpHttpToken.query().insert(incomingTokens)
          }
          const account = await IlpAccountModel.query()
            .patchAndFetchById(accountOptions.accountId, {
              disabled: accountOptions.disabled,
              maxPacketAmount: accountOptions.maxPacketAmount,
              outgoingEndpoint: accountOptions.http?.outgoing.endpoint,
              outgoingToken: accountOptions.http?.outgoing.authToken,
              streamEnabled: accountOptions.stream?.enabled
            })
            .throwIfNotFound()
          return toIlpAccount(account)
        }
      )
    } catch (err) {
      if (err instanceof UniqueViolationError) {
        return UpdateAccountError.DuplicateIncomingToken
      } else if (err instanceof NotFoundError) {
        return UpdateAccountError.UnknownAccount
      }
      throw err
    }
  }

  public async getAccount(accountId: string): Promise<IlpAccount | undefined> {
    const accountRow = await IlpAccountModel.query().findById(accountId)
    return accountRow ? toIlpAccount(accountRow) : undefined
  }

  public async getAccountBalance(
    accountId: string
  ): Promise<IlpBalance | undefined> {
    const account = await IlpAccountModel.query().findById(accountId).select(
      'balanceId'
      // 'debtBalanceId',
      // 'trustlineBalanceId',
      // 'loanBalanceId',
      // 'creditBalanceId'
    )

    if (!account) {
      return undefined
    }

    const balanceIds = [
      account.balanceId
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
    if (!balance) {
      throw new UnknownBalanceError(accountId)
    }

    const accountBalance: IlpBalance = {
      id: accountId,
      balance: calculateCreditBalance(balance)
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
          id: toLiquidityId({
            assetCode,
            assetScale,
            hmacSecret: this.config.hmacSecret
          }),
          flags:
            0 |
            AccountFlags.debits_must_not_exceed_credits |
            AccountFlags.linked
        },
        {
          id: toSettlementId({
            assetCode,
            assetScale,
            hmacSecret: this.config.hmacSecret
          }),
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

  public async depositLiquidity({
    assetCode,
    assetScale,
    amount,
    depositId
  }: {
    assetCode: string
    assetScale: number
    amount: bigint
    depositId?: bigint
  }): Promise<void | DepositError> {
    await this.createCurrencyBalances(assetCode, assetScale)
    const error = await this.createTransfer({
      transferId: depositId,
      sourceBalanceId: toSettlementId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      destinationBalanceId: toLiquidityId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      amount
    })
    if (error) {
      switch (error) {
        case CreateTransferError.exists:
          return DepositError.DepositExists
        case CreateTransferError.debit_account_not_found:
          throw new UnknownSettlementAccountError(assetCode, assetScale)
        case CreateTransferError.credit_account_not_found:
          throw new UnknownLiquidityAccountError(assetCode, assetScale)
        default:
          throw new BalanceTransferError(error)
      }
    }
  }

  public async withdrawLiquidity({
    assetCode,
    assetScale,
    amount,
    withdrawalId
  }: {
    assetCode: string
    assetScale: number
    amount: bigint
    withdrawalId?: bigint
  }): Promise<void | WithdrawError> {
    const error = await this.createTransfer({
      transferId: withdrawalId,
      sourceBalanceId: toLiquidityId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      destinationBalanceId: toSettlementId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      amount
    })
    if (error) {
      switch (error) {
        case CreateTransferError.exists:
          return WithdrawError.WithdrawalExists
        case CreateTransferError.debit_account_not_found:
          return WithdrawError.UnknownLiquidityAccount
        case CreateTransferError.credit_account_not_found:
          return WithdrawError.UnknownSettlementAccount
        case CreateTransferError.exceeds_credits:
          return WithdrawError.InsufficientLiquidity
        case CreateTransferError.exceeds_debits:
          return WithdrawError.InsufficientSettlementBalance
        default:
          throw new BalanceTransferError(error)
      }
    }
  }

  public async getLiquidityBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | undefined> {
    const balances = await this.client.lookupAccounts([
      toLiquidityId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      })
    ])
    if (balances.length === 1) {
      return calculateCreditBalance(balances[0])
    }
  }

  public async getSettlementBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | undefined> {
    const balances = await this.client.lookupAccounts([
      toSettlementId({
        assetCode,
        assetScale,
        hmacSecret: this.config.hmacSecret
      })
    ])
    if (balances.length === 1) {
      return calculateDebitBalance(balances[0])
    }
  }

  private async createTransfer({
    transferId,
    sourceBalanceId,
    destinationBalanceId,
    amount
  }: BalanceTransfer): Promise<void | CreateTransferError> {
    const res = await this.client.createTransfers([
      {
        id: transferId || randomId(),
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
    ])
    if (res.length) {
      switch (res[0].code) {
        case CreateTransferError.exists:
        case CreateTransferError.exists_with_different_debit_account_id:
        case CreateTransferError.exists_with_different_credit_account_id:
        case CreateTransferError.exists_with_different_user_data:
        case CreateTransferError.exists_with_different_reserved_field:
        case CreateTransferError.exists_with_different_code:
        case CreateTransferError.exists_with_different_amount:
        case CreateTransferError.exists_with_different_timeout:
        case CreateTransferError.exists_with_different_flags:
        case CreateTransferError.exists_and_already_committed_and_accepted:
        case CreateTransferError.exists_and_already_committed_and_rejected:
          return CreateTransferError.exists
        default:
          return res[0].code
      }
    }
  }

  public async deposit({
    accountId,
    amount,
    depositId
  }: {
    accountId: string
    amount: bigint
    depositId?: bigint
  }): Promise<void | DepositError> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('assetCode', 'assetScale', 'balanceId')
    if (!account) {
      return DepositError.UnknownAccount
    }
    const error = await this.createTransfer({
      transferId: depositId,
      sourceBalanceId: toSettlementId({
        assetCode: account.assetCode,
        assetScale: account.assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      destinationBalanceId: account.balanceId,
      amount
    })

    if (error) {
      switch (error) {
        case CreateTransferError.exists:
          return DepositError.DepositExists
        case CreateTransferError.debit_account_not_found:
          throw new UnknownSettlementAccountError(
            account.assetCode,
            account.assetScale
          )
        case CreateTransferError.credit_account_not_found:
          throw new UnknownBalanceError(accountId)
        default:
          throw new BalanceTransferError(error)
      }
    }
  }

  public async withdraw({
    accountId,
    amount,
    withdrawalId
  }: {
    accountId: string
    amount: bigint
    withdrawalId?: bigint
  }): Promise<void | WithdrawError> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('assetCode', 'assetScale', 'balanceId')
    if (!account) {
      return WithdrawError.UnknownAccount
    }
    const error = await this.createTransfer({
      transferId: withdrawalId,
      sourceBalanceId: account.balanceId,
      destinationBalanceId: toSettlementId({
        assetCode: account.assetCode,
        assetScale: account.assetScale,
        hmacSecret: this.config.hmacSecret
      }),
      amount
    })

    if (error) {
      switch (error) {
        case CreateTransferError.exists:
          return WithdrawError.WithdrawalExists
        case CreateTransferError.debit_account_not_found:
          throw new UnknownBalanceError(accountId)
        case CreateTransferError.credit_account_not_found:
          throw new UnknownSettlementAccountError(
            account.assetCode,
            account.assetScale
          )
        case CreateTransferError.exceeds_credits:
          return WithdrawError.InsufficientBalance
        case CreateTransferError.exceeds_debits:
          return WithdrawError.InsufficientSettlementBalance
        default:
          throw new BalanceTransferError(error)
      }
    }
  }

  public async getAccountByToken(
    token: string
  ): Promise<IlpAccount | undefined> {
    const account = await IlpAccountModel.query()
      .withGraphJoined('incomingTokens')
      .where('incomingTokens.token', token)
      .first()
    return account ? toIlpAccount(account) : undefined
  }

  private async getAccountByStaticIlpAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    const account = await IlpAccountModel.query()
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
  }

  private async getAccountByPeerAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    const peerAddress = this.config.peerAddresses.find(
      (peer: Peer) =>
        destinationAddress.startsWith(peer.ilpAddress) &&
        (destinationAddress.length === peer.ilpAddress.length ||
          destinationAddress[peer.ilpAddress.length] === '.')
    )
    if (peerAddress) {
      const account = await IlpAccountModel.query().findById(
        peerAddress.accountId
      )
      if (account) {
        return toIlpAccount(account)
      }
    }
  }

  private async getAccountByServerAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    if (this.config.ilpAddress) {
      if (
        destinationAddress.startsWith(this.config.ilpAddress + '.') &&
        (destinationAddress.length ===
          this.config.ilpAddress.length + 1 + UUID_LENGTH ||
          destinationAddress[
            this.config.ilpAddress.length + 1 + UUID_LENGTH
          ] === '.')
      ) {
        const accountId = destinationAddress.slice(
          this.config.ilpAddress.length + 1,
          this.config.ilpAddress.length + 1 + UUID_LENGTH
        )
        if (uuid.validate(accountId) && uuid.version(accountId) === 4) {
          const account = await IlpAccountModel.query().findById(accountId)
          if (account) {
            return toIlpAccount(account)
          }
        }
      }
    }
  }

  public async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    return (
      (await this.getAccountByStaticIlpAddress(destinationAddress)) ||
      (await this.getAccountByPeerAddress(destinationAddress)) ||
      (await this.getAccountByServerAddress(destinationAddress))
    )
  }

  public async getAddress(accountId: string): Promise<string | undefined> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('staticIlpAddress')
    if (!account) {
      return undefined
    } else if (account.staticIlpAddress) {
      return account.staticIlpAddress
    }
    const idx = this.config.peerAddresses.findIndex(
      (peer: Peer) => peer.accountId === accountId
    )
    if (idx !== -1) {
      return this.config.peerAddresses[idx].ilpAddress
    }
    if (this.config.ilpAddress) {
      return this.config.ilpAddress + '.' + accountId
    }
  }

  public async transferFunds({
    sourceAccountId,
    destinationAccountId,
    sourceAmount,
    destinationAmount
  }: Transfer): Promise<Transaction | TransferError> {
    const [
      sourceAccount,
      destinationAccount
    ] = await IlpAccountModel.query()
      .findByIds([sourceAccountId, destinationAccountId])
      .select('assetCode', 'assetScale', 'balanceId', 'id')
    if (!destinationAccount) {
      if (!sourceAccount || sourceAccount.id !== sourceAccountId) {
        return TransferError.UnknownSourceAccount
      } else {
        return TransferError.UnknownDestinationAccount
      }
    }

    const transfers: ClientTransfer[] = []

    const flags = 0 | TransferFlags.two_phase_commit
    const timeout = BigInt(1e9)

    if (sourceAccount.assetCode === destinationAccount.assetCode) {
      if (destinationAmount && sourceAmount !== destinationAmount) {
        return TransferError.InvalidDestinationAmount
      }
      transfers.push({
        id: randomId(),
        debit_account_id: sourceAccount.balanceId,
        credit_account_id: destinationAccount.balanceId,
        amount: sourceAmount,
        flags,
        timeout,
        reserved: TRANSFER_RESERVED,
        code: 0,
        user_data: BigInt(0),
        timestamp: BigInt(0)
      })
    } else {
      if (!destinationAmount) {
        return TransferError.InvalidDestinationAmount
      }

      transfers.push(
        {
          id: randomId(),
          debit_account_id: sourceAccount.balanceId,
          credit_account_id: toLiquidityId({
            assetCode: sourceAccount.assetCode,
            assetScale: sourceAccount.assetScale,
            hmacSecret: this.config.hmacSecret
          }),
          amount: sourceAmount,
          flags: flags | TransferFlags.linked,
          timeout,
          reserved: TRANSFER_RESERVED,
          code: 0,
          user_data: BigInt(0),
          timestamp: BigInt(0)
        },
        {
          id: randomId(),
          debit_account_id: toLiquidityId({
            assetCode: destinationAccount.assetCode,
            assetScale: destinationAccount.assetScale,
            hmacSecret: this.config.hmacSecret
          }),
          credit_account_id: destinationAccount.balanceId,
          amount: destinationAmount,
          flags,
          timeout,
          reserved: TRANSFER_RESERVED,
          code: 0,
          user_data: BigInt(0),
          timestamp: BigInt(0)
        }
      )
    }
    const res = await this.client.createTransfers(transfers)
    for (const { index, code } of res) {
      switch (code) {
        case CreateTransferError.linked_event_failed:
          break
        case CreateTransferError.debit_account_not_found:
          if (index === 1) {
            throw new UnknownLiquidityAccountError(
              destinationAccount.assetCode,
              destinationAccount.assetScale
            )
          }
          throw new UnknownBalanceError(sourceAccountId)
        case CreateTransferError.credit_account_not_found:
          if (index === 1) {
            throw new UnknownBalanceError(destinationAccountId)
          }
          throw new UnknownLiquidityAccountError(
            sourceAccount.assetCode,
            sourceAccount.assetScale
          )
        case CreateTransferError.exceeds_credits:
          if (index === 1) {
            return TransferError.InsufficientLiquidity
          }
          return TransferError.InsufficientBalance
        default:
          throw new BalanceTransferError(code)
      }
    }

    const trx: Transaction = {
      commit: async (): Promise<void | TransferError> => {
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
        for (const { code } of res) {
          switch (code) {
            case CommitTransferError.linked_event_failed:
              break
            case CommitTransferError.transfer_expired:
              return TransferError.TransferExpired
            case CommitTransferError.already_committed:
              return TransferError.TransferAlreadyCommitted
            case CommitTransferError.already_committed_but_rejected:
              return TransferError.TransferAlreadyRejected
            default:
              throw new BalanceTransferError(code)
          }
        }
      },
      rollback: async (): Promise<void | TransferError> => {
        const res = await this.client.commitTransfers(
          transfers.map((transfer) => {
            const flags =
              transfer.flags & TransferFlags.linked ? 0 | CommitFlags.linked : 0
            return {
              id: transfer.id,
              flags: flags | CommitFlags.reject,
              reserved: TRANSFER_RESERVED,
              code: 0,
              timestamp: BigInt(0)
            }
          })
        )
        for (const { code } of res) {
          switch (code) {
            case CommitTransferError.linked_event_failed:
              break
            case CommitTransferError.transfer_expired:
              return TransferError.TransferExpired
            case CommitTransferError.already_committed_but_accepted:
              return TransferError.TransferAlreadyCommitted
            case CommitTransferError.already_committed:
              return TransferError.TransferAlreadyRejected
            default:
              throw new BalanceTransferError(code)
          }
        }
      }
    }
    return trx
  }
}
