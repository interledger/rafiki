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
  CreateTransferError,
  Transfer as ClientTransfer,
  TransferFlags
} from 'tigerbeetle-node'

import { Config } from '../config'
import {
  // InvalidAssetError,
  TransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError
} from '../errors'
import { IlpAccount as IlpAccountModel, IlpHttpToken } from '../models'
import {
  getNetBalance,
  toLiquidityId,
  toSettlementId,
  // toSettlementCreditId,
  // toSettlementLoanId,
  randomId
} from '../utils'
import {
  AccountError,
  AccountsService as ConnectorAccountsService,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  Transaction,
  Transfer
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

const UUID_LENGTH = 36

export class AccountsService implements ConnectorAccountsService {
  constructor(
    private client: Client,
    private config: typeof Config,
    private logger: Logger
  ) {}

  public async createAccount(
    account: CreateOptions
  ): Promise<IlpAccount | AccountError> {
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
            return AccountError.DuplicateAccountId
          case 'ilphttptokens_token_unique':
            return AccountError.DuplicateIncomingToken
        }
      }
      throw err
    }
  }

  public async updateAccount(
    accountOptions: UpdateIlpAccountOptions
  ): Promise<IlpAccount | AccountError> {
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
        return AccountError.DuplicateIncomingToken
      } else if (err instanceof NotFoundError) {
        return AccountError.UnknownAccount
      }
      throw err
    }
  }

  public async getAccount(accountId: string): Promise<IlpAccount | null> {
    const accountRow = await IlpAccountModel.query().findById(accountId)
    return accountRow ? toIlpAccount(accountRow) : null
  }

  public async getAccountBalance(
    accountId: string
  ): Promise<IlpBalance | null> {
    const account = await IlpAccountModel.query().findById(accountId).select(
      'balanceId'
      // 'debtBalanceId',
      // 'trustlineBalanceId',
      // 'loanBalanceId',
      // 'creditBalanceId'
    )

    if (!account) {
      return null
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
  ): Promise<void | AccountError> {
    await this.createCurrencyBalances(assetCode, assetScale)
    const error = await this.createTransfer({
      sourceBalanceId: toSettlementId(assetCode, assetScale),
      destinationBalanceId: toLiquidityId(assetCode, assetScale),
      amount
    })
    if (error) {
      switch (error) {
        case CreateTransferError.debit_account_not_found:
          return AccountError.UnknownSettlementAccount
        case CreateTransferError.credit_account_not_found:
          return AccountError.UnknownLiquidityAccount
        default:
          throw new TransferError(error)
      }
    }
  }

  public async withdrawLiquidity(
    assetCode: string,
    assetScale: number,
    amount: bigint
  ): Promise<void | AccountError> {
    const error = await this.createTransfer({
      sourceBalanceId: toLiquidityId(assetCode, assetScale),
      destinationBalanceId: toSettlementId(assetCode, assetScale),
      amount
    })
    if (error) {
      switch (error) {
        case CreateTransferError.debit_account_not_found:
          return AccountError.UnknownLiquidityAccount
        case CreateTransferError.credit_account_not_found:
          return AccountError.UnknownSettlementAccount
        case CreateTransferError.exceeds_credits:
          return AccountError.InsufficientLiquidity
        case CreateTransferError.exceeds_debits:
          return AccountError.InsufficientSettlementBalance
        default:
          throw new TransferError(error)
      }
    }
  }

  public async getLiquidityBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | null> {
    const balances = await this.client.lookupAccounts([
      toLiquidityId(assetCode, assetScale)
    ])
    if (balances.length !== 1) {
      return null
    }
    return getNetBalance(balances[0])
  }

  public async getSettlementBalance(
    assetCode: string,
    assetScale: number
  ): Promise<bigint | null> {
    const balances = await this.client.lookupAccounts([
      toSettlementId(assetCode, assetScale)
    ])
    if (balances.length !== 1) {
      return null
    }
    return getNetBalance(balances[0])
  }

  private async createTransfer({
    sourceBalanceId,
    destinationBalanceId,
    amount
  }: BalanceTransfer): Promise<void | CreateTransferError> {
    const res = await this.client.createTransfers([
      {
        id: randomId(),
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
      return res[0].code
    }
  }

  public async deposit(
    accountId: string,
    amount: bigint
  ): Promise<void | AccountError> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('assetCode', 'assetScale', 'balanceId')
    if (!account) {
      return AccountError.UnknownAccount
    }
    const error = await this.createTransfer({
      sourceBalanceId: toSettlementId(account.assetCode, account.assetScale),
      destinationBalanceId: account.balanceId,
      amount
    })

    if (error) {
      switch (error) {
        case CreateTransferError.debit_account_not_found:
          return AccountError.UnknownSettlementAccount
        case CreateTransferError.credit_account_not_found:
          throw new UnknownBalanceError(accountId)
        default:
          throw new TransferError(error)
      }
    }
  }

  public async withdraw(
    accountId: string,
    amount: bigint
  ): Promise<void | AccountError> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('assetCode', 'assetScale', 'balanceId')
    if (!account) {
      return AccountError.UnknownAccount
    }
    const error = await this.createTransfer({
      sourceBalanceId: account.balanceId,
      destinationBalanceId: toSettlementId(
        account.assetCode,
        account.assetScale
      ),
      amount
    })

    if (error) {
      switch (error) {
        case CreateTransferError.debit_account_not_found:
          throw new UnknownBalanceError(accountId)
        case CreateTransferError.credit_account_not_found:
          return AccountError.UnknownSettlementAccount
        case CreateTransferError.exceeds_credits:
          return AccountError.InsufficientBalance
        case CreateTransferError.exceeds_debits:
          return AccountError.InsufficientSettlementBalance
        default:
          throw new TransferError(error)
      }
    }
  }

  public async getAccountByToken(token: string): Promise<IlpAccount | null> {
    const account = await IlpAccountModel.query()
      .withGraphJoined('incomingTokens')
      .where('incomingTokens.token', token)
      .first()
    return account ? toIlpAccount(account) : null
  }

  public async getAccountByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | null> {
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
    return null
  }

  public async getAddress(accountId: string): Promise<string | null> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select('staticIlpAddress')
    if (!account) {
      return null
    } else if (account.staticIlpAddress) {
      return account.staticIlpAddress
    }
    const idx = this.config.peerAddresses.findIndex(
      (peer: Peer) => peer.accountId === accountId
    )
    if (idx !== -1) {
      return this.config.peerAddresses[idx].ilpAddress
    }
    return this.config.ilpAddress + '.' + accountId
  }

  public async transferFunds({
    sourceAccountId,
    destinationAccountId,
    sourceAmount,
    destinationAmount
  }: Transfer): Promise<Transaction | AccountError> {
    const [
      sourceAccount,
      destinationAccount
    ] = await IlpAccountModel.query()
      .findByIds([sourceAccountId, destinationAccountId])
      .select('assetCode', 'assetScale', 'balanceId', 'id')
    if (!destinationAccount) {
      if (!sourceAccount || sourceAccount.id !== sourceAccountId) {
        return AccountError.UnknownSourceAccount
      } else {
        return AccountError.UnknownDestinationAccount
      }
    }

    const transfers: ClientTransfer[] = []

    const flags = 0 | TransferFlags.two_phase_commit
    const timeout = BigInt(1e9)

    if (sourceAccount.assetCode === destinationAccount.assetCode) {
      if (destinationAmount && sourceAmount !== destinationAmount) {
        return AccountError.InvalidDestinationAmount
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
        return AccountError.InvalidDestinationAmount
      }

      transfers.push(
        {
          id: randomId(),
          debit_account_id: sourceAccount.balanceId,
          credit_account_id: toLiquidityId(
            sourceAccount.assetCode,
            sourceAccount.assetScale
          ),
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
          debit_account_id: toLiquidityId(
            destinationAccount.assetCode,
            destinationAccount.assetScale
          ),
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
            return AccountError.InsufficientLiquidity
          }
          return AccountError.InsufficientBalance
        default:
          throw new TransferError(code)
      }
    }
    const trx: Transaction = {
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
        if (res.length) {
          // TODO throw
        }
      }
    }
    return trx
  }
}
