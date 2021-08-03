import {
  NotFoundError,
  PartialModelObject,
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
  CreateTransfersError,
  TransferFlags
} from 'tigerbeetle-node'

import { Config } from '../config'
import {
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError,
  UnknownSettlementAccountError
} from './errors'
import {
  IlpAccount as IlpAccountModel,
  IlpAccountWithSuperAccount,
  IlpHttpToken
} from './models'
import {
  calculateCreditBalance,
  calculateDebitBalance,
  toLiquidityId,
  toSettlementId,
  randomId
} from './utils'
import {
  AccountsService as AccountsServiceInterface,
  CreateAccountError,
  CreateOptions,
  DepositError,
  ExtendTrustlineOptions,
  IlpAccount,
  IlpBalance,
  SettleTrustlineOptions,
  Transaction,
  Transfer,
  TransferError,
  TrustlineOptions,
  TrustlineError,
  UpdateAccountError,
  UpdateOptions,
  WithdrawError
} from './types'

const MAX_SUB_ACCOUNT_DEPTH = 64

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
  if (accountRow.superAccountId) {
    account.superAccountId = accountRow.superAccountId
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

interface BalanceOptions {
  id: bigint
  flags: number
}

interface BalanceTransfer {
  id?: bigint
  sourceBalanceId: bigint
  destinationBalanceId: bigint
  amount: bigint
  twoPhaseCommit?: boolean
}

interface TwoPhaseTransfer extends BalanceTransfer {
  id: bigint
  twoPhaseCommit: boolean
}

interface Peer {
  accountId: string
  ilpAddress: string
}

const ACCOUNT_RESERVED = Buffer.alloc(48)
const TRANSFER_RESERVED = Buffer.alloc(32)

const UUID_LENGTH = 36

export class AccountsService implements AccountsServiceInterface {
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
          const newAccount: PartialModelObject<IlpAccountModel> = {
            id: account.accountId,
            disabled: account.disabled,
            assetCode: account.asset.code,
            assetScale: account.asset.scale,
            superAccountId: account.superAccountId,
            maxPacketAmount: account.maxPacketAmount,
            outgoingEndpoint: account.http?.outgoing.endpoint,
            outgoingToken: account.http?.outgoing.authToken,
            streamEnabled: account.stream?.enabled,
            staticIlpAddress: account.routing?.staticIlpAddress
          }
          const newBalances: BalanceOptions[] = []
          const superAccountPatch: PartialModelObject<IlpAccountModel> = {}
          if (account.superAccountId) {
            const superAccount = await IlpAccountModel.query()
              .findById(account.superAccountId)
              .forUpdate()
              .throwIfNotFound()
            if (
              account.asset.code !== superAccount.assetCode ||
              account.asset.scale !== superAccount.assetScale
            ) {
              return CreateAccountError.InvalidAsset
            }
            newAccount.trustlineBalanceId = randomId()
            newAccount.borrowedBalanceId = randomId()
            newBalances.push(
              {
                id: newAccount.trustlineBalanceId,
                flags:
                  0 |
                  AccountFlags.debits_must_not_exceed_credits |
                  AccountFlags.linked
              },
              {
                id: newAccount.borrowedBalanceId,
                flags:
                  0 |
                  AccountFlags.debits_must_not_exceed_credits |
                  AccountFlags.linked
              }
            )
            if (
              !superAccount.creditExtendedBalanceId !==
              !superAccount.lentBalanceId
            ) {
              this.logger.warn(superAccount, 'missing super-account balance')
            }
            if (!superAccount.creditExtendedBalanceId) {
              superAccountPatch.creditExtendedBalanceId = randomId()
              newBalances.push({
                id: superAccountPatch.creditExtendedBalanceId,
                flags:
                  0 |
                  AccountFlags.credits_must_not_exceed_debits |
                  AccountFlags.linked
              })
            }
            if (!superAccount.lentBalanceId) {
              superAccountPatch.lentBalanceId = randomId()
              newBalances.push({
                id: superAccountPatch.lentBalanceId,
                flags:
                  0 |
                  AccountFlags.credits_must_not_exceed_debits |
                  AccountFlags.linked
              })
            }
          }

          newAccount.balanceId = randomId()
          newBalances.push({
            id: newAccount.balanceId,
            flags: 0 | AccountFlags.debits_must_not_exceed_credits
          })

          await this.createBalances(newBalances, account.asset.scale)

          if (account.superAccountId) {
            await IlpAccountModel.query()
              .patch(superAccountPatch)
              .findById(account.superAccountId)
              .throwIfNotFound()
          }
          const accountRow = await IlpAccountModel.query().insertAndFetch(
            newAccount
          )

          const incomingTokens = account.http?.incoming?.authTokens.map(
            (incomingToken: string) => {
              return {
                accountId: account.accountId,
                token: incomingToken
              }
            }
          )
          if (incomingTokens) {
            await IlpHttpToken.query().insert(incomingTokens)
          }

          if (!account.superAccountId) {
            await this.createCurrencyBalances(
              account.asset.code,
              account.asset.scale
            )
          }
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
      } else if (err instanceof NotFoundError) {
        return CreateAccountError.UnknownSuperAccount
      }
      throw err
    }
  }

  public async updateAccount(
    accountOptions: UpdateOptions
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
              (incomingToken: string) => {
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

  public async getSubAccounts(accountId: string): Promise<IlpAccount[]> {
    const accountRow = await IlpAccountModel.query()
      .withGraphJoined('subAccounts')
      .findById(accountId)
      .select('subAccounts')

    return accountRow && accountRow.subAccounts
      ? accountRow.subAccounts.map((subAccount) => toIlpAccount(subAccount))
      : []
  }

  public async getAccountBalance(
    accountId: string
  ): Promise<IlpBalance | undefined> {
    const account = await IlpAccountModel.query()
      .findById(accountId)
      .select(
        'assetCode',
        'assetScale',
        'balanceId',
        'trustlineBalanceId',
        'creditExtendedBalanceId',
        'borrowedBalanceId',
        'lentBalanceId'
      )

    if (!account) {
      return undefined
    }

    const balanceIds = [account.balanceId]
    const columns = [
      'trustlineBalanceId',
      'creditExtendedBalanceId',
      'borrowedBalanceId',
      'lentBalanceId'
    ]
    columns.forEach((balanceId) => {
      if (account[balanceId]) {
        balanceIds.push(account[balanceId])
      }
    })
    const balances = await this.client.lookupAccounts(balanceIds)

    if (balances.length === 0) {
      throw new UnknownBalanceError(accountId)
    }

    const accountBalance: IlpBalance = {
      id: accountId,
      asset: {
        code: account.assetCode,
        scale: account.assetScale
      },
      balance: BigInt(0),
      availableCredit: BigInt(0),
      creditExtended: BigInt(0),
      totalBorrowed: BigInt(0),
      totalLent: BigInt(0)
    }

    balances.forEach((balance) => {
      switch (balance.id) {
        case account.balanceId:
          accountBalance.balance = calculateCreditBalance(balance)
          break
        case account.trustlineBalanceId:
          accountBalance.availableCredit = calculateCreditBalance(balance)
          break
        case account.creditExtendedBalanceId:
          accountBalance.creditExtended = calculateDebitBalance(balance)
          break
        case account.borrowedBalanceId:
          accountBalance.totalBorrowed = calculateCreditBalance(balance)
          break
        case account.lentBalanceId:
          accountBalance.totalLent = calculateDebitBalance(balance)
          break
      }
    })

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
    const error = await this.createTransfers([
      {
        id: depositId,
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
      }
    ])
    if (error) {
      switch (error.code) {
        case CreateTransferError.exists:
          return DepositError.DepositExists
        case CreateTransferError.debit_account_not_found:
          throw new UnknownSettlementAccountError(assetCode, assetScale)
        case CreateTransferError.credit_account_not_found:
          throw new UnknownLiquidityAccountError(assetCode, assetScale)
        default:
          throw new BalanceTransferError(error.code)
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
    const error = await this.createTransfers([
      {
        id: withdrawalId,
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
      }
    ])
    if (error) {
      switch (error.code) {
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
          throw new BalanceTransferError(error.code)
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

  private async createTransfers(
    transfers: BalanceTransfer[]
  ): Promise<void | CreateTransfersError> {
    const res = await this.client.createTransfers(
      transfers.map((transfer, idx) => {
        let flags = 0
        if (transfer.twoPhaseCommit) {
          flags |= TransferFlags.two_phase_commit
        }
        if (idx < transfers.length - 1) {
          flags |= TransferFlags.linked
        }
        return {
          id: transfer.id || randomId(),
          debit_account_id: transfer.sourceBalanceId,
          credit_account_id: transfer.destinationBalanceId,
          amount: transfer.amount,
          user_data: BigInt(0),
          reserved: TRANSFER_RESERVED,
          code: 0,
          flags,
          timeout: transfer.twoPhaseCommit ? BigInt(1e9) : BigInt(0),
          timestamp: BigInt(0)
        }
      })
    )
    for (const { index, code } of res) {
      switch (code) {
        case CreateTransferError.linked_event_failed:
          break
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
          return { index, code: CreateTransferError.exists }
        default:
          return { index, code }
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
    const error = await this.createTransfers([
      {
        id: depositId,
        sourceBalanceId: toSettlementId({
          assetCode: account.assetCode,
          assetScale: account.assetScale,
          hmacSecret: this.config.hmacSecret
        }),
        destinationBalanceId: account.balanceId,
        amount
      }
    ])

    if (error) {
      switch (error.code) {
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
          throw new BalanceTransferError(error.code)
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
    const error = await this.createTransfers([
      {
        id: withdrawalId,
        sourceBalanceId: account.balanceId,
        destinationBalanceId: toSettlementId({
          assetCode: account.assetCode,
          assetScale: account.assetScale,
          hmacSecret: this.config.hmacSecret
        }),
        amount
      }
    ])

    if (error) {
      switch (error.code) {
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
          throw new BalanceTransferError(error.code)
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
    if (sourceAccountId === destinationAccountId) {
      return TransferError.SameAccounts
    }
    if (sourceAmount <= BigInt(0)) {
      return TransferError.InvalidSourceAmount
    }
    if (destinationAmount !== undefined && destinationAmount <= BigInt(0)) {
      return TransferError.InvalidDestinationAmount
    }
    const accounts = await IlpAccountModel.query()
      .findByIds([sourceAccountId, destinationAccountId])
      .select('assetCode', 'assetScale', 'balanceId', 'id')
    if (accounts.length !== 2) {
      if (accounts.length === 0 || accounts[0].id !== sourceAccountId) {
        return TransferError.UnknownSourceAccount
      } else {
        return TransferError.UnknownDestinationAccount
      }
    }
    const sourceAccount =
      accounts[0].id === sourceAccountId ? accounts[0] : accounts[1]
    const destinationAccount =
      accounts[0].id === destinationAccountId ? accounts[0] : accounts[1]

    const transfers: TwoPhaseTransfer[] = []

    if (sourceAccount.assetCode === destinationAccount.assetCode) {
      if (destinationAmount && sourceAmount !== destinationAmount) {
        return TransferError.InvalidDestinationAmount
      }
      transfers.push({
        id: randomId(),
        sourceBalanceId: sourceAccount.balanceId,
        destinationBalanceId: destinationAccount.balanceId,
        amount: sourceAmount,
        twoPhaseCommit: true
      })
    } else {
      if (!destinationAmount) {
        return TransferError.InvalidDestinationAmount
      }
      transfers.push(
        {
          id: randomId(),
          sourceBalanceId: sourceAccount.balanceId,
          destinationBalanceId: toLiquidityId({
            assetCode: sourceAccount.assetCode,
            assetScale: sourceAccount.assetScale,
            hmacSecret: this.config.hmacSecret
          }),
          amount: sourceAmount,
          twoPhaseCommit: true
        },
        {
          id: randomId(),
          sourceBalanceId: toLiquidityId({
            assetCode: destinationAccount.assetCode,
            assetScale: destinationAccount.assetScale,
            hmacSecret: this.config.hmacSecret
          }),
          destinationBalanceId: destinationAccount.balanceId,
          amount: destinationAmount,
          twoPhaseCommit: true
        }
      )
    }
    const error = await this.createTransfers(transfers)
    if (error) {
      switch (error.code) {
        case CreateTransferError.linked_event_failed:
          break
        case CreateTransferError.debit_account_not_found:
          if (error.index === 1) {
            throw new UnknownLiquidityAccountError(
              destinationAccount.assetCode,
              destinationAccount.assetScale
            )
          }
          throw new UnknownBalanceError(sourceAccountId)
        case CreateTransferError.credit_account_not_found:
          if (error.index === 1) {
            throw new UnknownBalanceError(destinationAccountId)
          }
          throw new UnknownLiquidityAccountError(
            sourceAccount.assetCode,
            sourceAccount.assetScale
          )
        case CreateTransferError.exceeds_credits:
          if (error.index === 1) {
            return TransferError.InsufficientLiquidity
          }
          return TransferError.InsufficientBalance
        default:
          throw new BalanceTransferError(error.code)
      }
    }

    const trx: Transaction = {
      commit: async (): Promise<void | TransferError> => {
        const res = await this.client.commitTransfers(
          transfers.map((transfer, idx) => {
            return {
              id: transfer.id,
              flags: idx < transfers.length - 1 ? 0 | CommitFlags.linked : 0,
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
          transfers.map((transfer, idx) => {
            const flags =
              idx < transfers.length - 1 ? 0 | CommitFlags.linked : 0
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

  /**
   * Extends additional line of credit to sub-account from its super-account(s)
   *
   * @param {Object} options
   * @param {string} options.accountId - Sub-account to which credit is extended
   * @param {bigint} options.amount
   * @param {boolean} [options.autoApply] - Utilize credit and apply to sub-account's balance (default: false)
   *
   * Recursive transfers take place between each sub-account/super-account pair,
   * starting at accountId and continuing to the top-level super-account.
   */
  public async extendTrustline({
    accountId,
    amount,
    autoApply
  }: ExtendTrustlineOptions): Promise<void | TrustlineError> {
    const account = await this.getAccountWithSuperAccounts(accountId)
    if (!account) {
      return TrustlineError.UnknownAccount
    } else if (!account.hasSuperAccount()) {
      return TrustlineError.UnknownSuperAccount
    }
    const transfers: BalanceTransfer[] = []
    account.forEachNestedAccount((acct) => {
      if (autoApply) {
        transfers.push(
          ...AccountsService.increaseDebt({
            account: acct,
            amount,
            debtorAccount: account
          })
        )
      } else {
        transfers.push(
          AccountsService.increaseCredit({ account: acct, amount })
        )
      }
    })
    const err = await this.createTransfers(transfers)
    if (err) {
      if (err.code === CreateTransferError.exceeds_credits) {
        return TrustlineError.InsufficientBalance
      }
      throw new BalanceTransferError(err.code)
    }
  }

  /**
   * Utilizes line of credit to sub-account and applies to sub-account's balance
   *
   * @param {Object} options
   * @param {string} options.accountId - Sub-account to which credit is extended
   * @param {bigint} options.amount
   *
   * Recursive transfers take place between each sub-account/super-account pair,
   * starting at accountId and continuing to the top-level super-account.
   */
  public async utilizeTrustline({
    accountId,
    amount
  }: TrustlineOptions): Promise<void | TrustlineError> {
    const account = await this.getAccountWithSuperAccounts(accountId)
    if (!account) {
      return TrustlineError.UnknownAccount
    } else if (!account.hasSuperAccount()) {
      return TrustlineError.UnknownSuperAccount
    }
    const transfers: BalanceTransfer[] = []
    account.forEachNestedAccount((acct) => {
      transfers.push(AccountsService.decreaseCredit({ account: acct, amount }))
      transfers.push(
        ...AccountsService.increaseDebt({
          account: acct,
          amount,
          debtorAccount: account
        })
      )
    })
    const err = await this.createTransfers(transfers)
    if (err) {
      if (err.code === CreateTransferError.exceeds_credits) {
        return TrustlineError.InsufficientBalance
      }
      throw new BalanceTransferError(err.code)
    }
  }

  /**
   * Reduces an existing line of credit available to the sub-account
   *
   * @param {Object} options
   * @param {string} options.accountId - Sub-account to which credit is extended
   * @param {bigint} options.amount
   *
   * Recursive transfers take place between each sub-account/super-account pair,
   * starting at accountId and continuing to the top-level super-account.
   */
  public async revokeTrustline({
    accountId,
    amount
  }: TrustlineOptions): Promise<void | TrustlineError> {
    const account = await this.getAccountWithSuperAccounts(accountId)
    if (!account) {
      return TrustlineError.UnknownAccount
    } else if (!account.hasSuperAccount()) {
      return TrustlineError.UnknownSuperAccount
    }
    const transfers: BalanceTransfer[] = []
    account.forEachNestedAccount((account) => {
      transfers.push(AccountsService.decreaseCredit({ account, amount }))
    })
    const err = await this.createTransfers(transfers)
    if (err) {
      if (err.code === CreateTransferError.exceeds_credits) {
        return TrustlineError.InsufficientBalance
      }
      throw new BalanceTransferError(err.code)
    }
  }

  /**
   * Pays back debt to super-account(s)
   *
   * @param {Object} options
   * @param {string} options.accountId - Sub-account settling debt
   * @param {bigint} options.amount
   * @param {boolean} [options.revolve] - Replenish the sub-account's line of credit commensurate with the debt settled (default: true)
   *
   * Recursive transfers take place between each sub-account/super-account pair,
   * starting at accountId and continuing to the top-level super-account.
   */
  public async settleTrustline({
    accountId,
    amount,
    revolve
  }: SettleTrustlineOptions): Promise<void | TrustlineError> {
    const account = await this.getAccountWithSuperAccounts(accountId)
    if (!account) {
      return TrustlineError.UnknownAccount
    } else if (!account.hasSuperAccount()) {
      return TrustlineError.UnknownSuperAccount
    }
    const transfers: BalanceTransfer[] = []
    account.forEachNestedAccount((acct) => {
      transfers.push(
        ...AccountsService.decreaseDebt({
          account: acct,
          amount,
          debtorAccount: account
        })
      )
      if (revolve !== false) {
        transfers.push(
          AccountsService.increaseCredit({ account: acct, amount })
        )
      }
    })
    const err = await this.createTransfers(transfers)
    if (err) {
      if (err.code === CreateTransferError.exceeds_credits) {
        return TrustlineError.InsufficientBalance
      }
      throw new BalanceTransferError(err.code)
    }
  }

  private static forEachNestedAccount({
    account: accountWithSuperAccounts,
    callback
  }: {
    account: IlpAccountModel
    callback: (account: IlpAccountWithSuperAccount) => void
  }) {
    for (
      let account = accountWithSuperAccounts;
      account.hasSuperAccount();
      account = account.superAccount
    ) {
      callback(account)
    }
  }

  private static increaseCredit({
    account,
    amount
  }: {
    account: IlpAccountWithSuperAccount
    amount: bigint
  }): BalanceTransfer {
    if (!account.trustlineBalanceId) {
      throw new UnknownBalanceError(account.id)
    } else if (!account.superAccount.creditExtendedBalanceId) {
      throw new UnknownBalanceError(account.superAccount.id)
    }
    return {
      sourceBalanceId: account.superAccount.creditExtendedBalanceId,
      destinationBalanceId: account.trustlineBalanceId,
      amount
    }
  }

  private static decreaseCredit({
    account,
    amount
  }: {
    account: IlpAccountWithSuperAccount
    amount: bigint
  }): BalanceTransfer {
    if (!account.trustlineBalanceId) {
      throw new UnknownBalanceError(account.id)
    } else if (!account.superAccount.creditExtendedBalanceId) {
      throw new UnknownBalanceError(account.superAccount.id)
    }
    return {
      sourceBalanceId: account.trustlineBalanceId,
      destinationBalanceId: account.superAccount.creditExtendedBalanceId,
      amount
    }
  }

  private static increaseDebt({
    account,
    amount,
    debtorAccount
  }: {
    account: IlpAccountWithSuperAccount
    amount: bigint
    debtorAccount: IlpAccountModel
  }): BalanceTransfer[] {
    if (!account.borrowedBalanceId) {
      throw new UnknownBalanceError(account.id)
    } else if (!account.superAccount.lentBalanceId) {
      throw new UnknownBalanceError(account.superAccount.id)
    }
    const transfers: BalanceTransfer[] = [
      {
        sourceBalanceId: account.superAccount.lentBalanceId,
        destinationBalanceId: account.borrowedBalanceId,
        amount
      }
    ]
    if (!account.superAccount.superAccountId) {
      transfers.push({
        sourceBalanceId: account.superAccount.balanceId,
        destinationBalanceId: debtorAccount.balanceId,
        amount
      })
    }
    return transfers
  }

  private static decreaseDebt({
    account,
    amount,
    debtorAccount
  }: {
    account: IlpAccountWithSuperAccount
    amount: bigint
    debtorAccount: IlpAccountModel
  }): BalanceTransfer[] {
    if (!account.borrowedBalanceId) {
      throw new UnknownBalanceError(account.id)
    } else if (!account.superAccount.lentBalanceId) {
      throw new UnknownBalanceError(account.superAccount.id)
    }
    const transfers: BalanceTransfer[] = [
      {
        sourceBalanceId: account.borrowedBalanceId,
        destinationBalanceId: account.superAccount.lentBalanceId,
        amount
      }
    ]
    if (!account.superAccount.superAccountId) {
      transfers.push({
        sourceBalanceId: debtorAccount.balanceId,
        destinationBalanceId: account.superAccount.balanceId,
        amount
      })
    }
    return transfers
  }

  private async getAccountWithSuperAccounts(
    accountId: string
  ): Promise<IlpAccountModel | undefined> {
    const account = await IlpAccountModel.query()
      .withGraphFetched(`superAccount.^${MAX_SUB_ACCOUNT_DEPTH}`, {
        minimize: true
      })
      .findById(accountId)
    return account || undefined
  }
}
