import {
  NotFoundError,
  PartialModelObject,
  raw,
  transaction,
  UniqueViolationError
} from 'objection'
import { Logger } from 'pino'
import * as uuid from 'uuid'

import { Asset, AssetService } from '../asset/service'
import {
  BalanceOptions,
  BalanceService,
  CommitTransferError,
  CreateTransferError,
  TwoPhaseTransfer
} from '../balance/service'
import {
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError
} from '../shared/errors'
import { randomId } from '../shared/utils'
import { Config } from '../config'
import { UnknownAssetError } from './errors'
import { IlpAccount as IlpAccountModel, IlpHttpToken } from './models'
import { calculateCreditBalance, calculateDebitBalance } from './utils'
import {
  AccountsService as AccountsServiceInterface,
  CreateAccountError,
  CreateOptions,
  IlpAccount,
  IlpBalance,
  isSubAccount,
  Pagination,
  Transaction,
  Transfer,
  TransferError,
  UpdateAccountError,
  UpdateOptions
} from './types'

function toIlpAccount(accountRow: IlpAccountModel): IlpAccount {
  const account: IlpAccount = {
    id: accountRow.id,
    disabled: accountRow.disabled,
    asset: {
      code: accountRow.asset.code,
      scale: accountRow.asset.scale
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

interface Peer {
  accountId: string
  ilpAddress: string
}

const UUID_LENGTH = 36

export class AccountsService implements AccountsServiceInterface {
  constructor(
    private assetService: AssetService,
    private balanceService: BalanceService,
    private config: typeof Config,
    private logger: Logger
  ) {}

  public async createAccount(
    account: CreateOptions
  ): Promise<IlpAccount | CreateAccountError> {
    try {
      const newAccount: PartialModelObject<IlpAccountModel> = {
        id: account.id,
        disabled: account.disabled,
        maxPacketAmount: account.maxPacketAmount,
        outgoingEndpoint: account.http?.outgoing.endpoint,
        outgoingToken: account.http?.outgoing.authToken,
        streamEnabled: account.stream?.enabled,
        staticIlpAddress: account.routing?.staticIlpAddress
      }
      // Don't rollback creating a new asset if account creation fails.
      // Asset rows include a smallserial column that would have sequence gaps
      // if a transaction is rolled back.
      // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
      if (isSubAccount(account)) {
        newAccount.superAccountId = account.superAccountId
        const superAccount = await IlpAccountModel.query()
          .findById(account.superAccountId)
          .withGraphFetched('asset(withUnit)')
          .throwIfNotFound()
        newAccount.assetId = superAccount.assetId
        newAccount.asset = superAccount.asset
      } else {
        newAccount.asset = await this.assetService.getOrCreate(account.asset)
        newAccount.assetId = newAccount.asset.id
      }
      return await transaction(
        IlpAccountModel,
        IlpHttpToken,
        async (IlpAccountModel, IlpHttpToken) => {
          const newBalances: BalanceOptions[] = []
          const superAccountPatch: PartialModelObject<IlpAccountModel> = {}
          if (isSubAccount(account)) {
            newAccount.superAccountId = account.superAccountId
            const superAccount = await IlpAccountModel.query()
              .findById(account.superAccountId)
              .withGraphFetched('asset(withUnit)')
              .forUpdate()
              .throwIfNotFound()
            newAccount.creditBalanceId = randomId()
            newAccount.debtBalanceId = randomId()
            newBalances.push(
              {
                id: newAccount.creditBalanceId,
                unit: superAccount.asset.unit
              },
              {
                id: newAccount.debtBalanceId,
                unit: superAccount.asset.unit
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
                debitBalance: true,
                unit: superAccount.asset.unit
              })
            }
            if (!superAccount.lentBalanceId) {
              superAccountPatch.lentBalanceId = randomId()
              newBalances.push({
                id: superAccountPatch.lentBalanceId,
                debitBalance: true,
                unit: superAccount.asset.unit
              })
            }
          }

          newAccount.balanceId = randomId()
          newBalances.push({
            id: newAccount.balanceId,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            unit: newAccount.asset!.unit
          })

          await this.balanceService.create(newBalances)

          if (isSubAccount(account)) {
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
                accountId: accountRow.id,
                token: incomingToken
              }
            }
          )
          if (incomingTokens) {
            await IlpHttpToken.query().insert(incomingTokens)
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
              accountId: accountOptions.id
            })
            const incomingTokens = accountOptions.http.incoming.authTokens.map(
              (incomingToken: string) => {
                return {
                  accountId: accountOptions.id,
                  token: incomingToken
                }
              }
            )
            await IlpHttpToken.query().insert(incomingTokens)
          }
          const account = await IlpAccountModel.query()
            .patchAndFetchById(accountOptions.id, {
              disabled: accountOptions.disabled,
              maxPacketAmount: accountOptions.maxPacketAmount,
              outgoingEndpoint: accountOptions.http?.outgoing.endpoint,
              outgoingToken: accountOptions.http?.outgoing.authToken,
              streamEnabled: accountOptions.stream?.enabled,
              staticIlpAddress: accountOptions.routing?.staticIlpAddress
            })
            .throwIfNotFound()
          const asset = await this.assetService.getById(account.assetId)
          if (!asset) {
            throw new UnknownAssetError(account.id)
          }
          account.asset = asset
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
    const accountRow = await IlpAccountModel.query()
      .findById(accountId)
      .withGraphJoined('asset(codeAndScale)')

    return accountRow ? toIlpAccount(accountRow) : undefined
  }

  public async getSubAccounts(accountId: string): Promise<IlpAccount[]> {
    const accountRow = await IlpAccountModel.query()
      .withGraphJoined('subAccounts.asset(codeAndScale)')
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
        'balanceId',
        'creditBalanceId',
        'creditExtendedBalanceId',
        'debtBalanceId',
        'lentBalanceId'
      )

    if (!account) {
      return undefined
    }

    const balanceIds = [account.balanceId]
    const columns = [
      'creditBalanceId',
      'creditExtendedBalanceId',
      'debtBalanceId',
      'lentBalanceId'
    ]
    columns.forEach((balanceId) => {
      if (account[balanceId]) {
        balanceIds.push(account[balanceId])
      }
    })
    const balances = await this.balanceService.get(balanceIds)

    if (balances.length === 0) {
      throw new UnknownBalanceError(accountId)
    }

    const accountBalance: IlpBalance = {
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
        case account.creditBalanceId:
          accountBalance.availableCredit = calculateCreditBalance(balance)
          break
        case account.creditExtendedBalanceId:
          accountBalance.creditExtended = calculateDebitBalance(balance)
          break
        case account.debtBalanceId:
          accountBalance.totalBorrowed = calculateCreditBalance(balance)
          break
        case account.lentBalanceId:
          accountBalance.totalLent = calculateDebitBalance(balance)
          break
      }
    })

    return accountBalance
  }

  public async getLiquidityBalance({
    code,
    scale
  }: Asset): Promise<bigint | undefined> {
    const asset = await this.assetService.get({ code, scale })
    if (asset) {
      const balances = await this.balanceService.get([asset.liquidityBalanceId])
      if (balances.length === 1) {
        return calculateCreditBalance(balances[0])
      }
    }
  }

  public async getSettlementBalance({
    code,
    scale
  }: Asset): Promise<bigint | undefined> {
    const asset = await this.assetService.get({ code, scale })
    if (asset) {
      const balances = await this.balanceService.get([
        asset.settlementBalanceId
      ])
      if (balances.length === 1) {
        return calculateDebitBalance(balances[0])
      }
    }
  }

  public async getAccountByToken(
    token: string
  ): Promise<IlpAccount | undefined> {
    const account = await IlpAccountModel.query()
      .withGraphJoined('[asset(codeAndScale), incomingTokens]')
      .where('incomingTokens.token', token)
      .first()
    return account ? toIlpAccount(account) : undefined
  }

  private async getAccountByStaticIlpAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined> {
    const account = await IlpAccountModel.query()
      // new RegExp('^' + staticIlpAddress + '($|\\.)'))
      .withGraphJoined('asset(codeAndScale)')
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
      const account = await IlpAccountModel.query()
        .findById(peerAddress.accountId)
        .withGraphJoined('asset(codeAndScale)')
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
          const account = await IlpAccountModel.query()
            .findById(accountId)
            .withGraphJoined('asset(codeAndScale)')
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
      .withGraphJoined('asset')
      .select('asset', 'balanceId', 'ilpAccounts.id')
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

    if (
      sourceAccount.asset.code === destinationAccount.asset.code &&
      sourceAccount.asset.scale === destinationAccount.asset.scale
    ) {
      transfers.push({
        id: randomId(),
        sourceBalanceId: sourceAccount.balanceId,
        destinationBalanceId: destinationAccount.balanceId,
        amount:
          destinationAmount && destinationAmount < sourceAmount
            ? destinationAmount
            : sourceAmount,
        twoPhaseCommit: true
      })
      if (destinationAmount && sourceAmount !== destinationAmount) {
        if (destinationAmount < sourceAmount) {
          transfers.push({
            id: randomId(),
            sourceBalanceId: sourceAccount.balanceId,
            destinationBalanceId: sourceAccount.asset.liquidityBalanceId,
            amount: sourceAmount - destinationAmount,
            twoPhaseCommit: true
          })
        } else {
          transfers.push({
            id: randomId(),
            sourceBalanceId: destinationAccount.asset.liquidityBalanceId,
            destinationBalanceId: destinationAccount.balanceId,
            amount: destinationAmount - sourceAmount,
            twoPhaseCommit: true
          })
        }
      }
    } else {
      if (!destinationAmount) {
        return TransferError.InvalidDestinationAmount
      }
      transfers.push(
        {
          id: randomId(),
          sourceBalanceId: sourceAccount.balanceId,
          destinationBalanceId: sourceAccount.asset.liquidityBalanceId,
          amount: sourceAmount,
          twoPhaseCommit: true
        },
        {
          id: randomId(),
          sourceBalanceId: destinationAccount.asset.liquidityBalanceId,
          destinationBalanceId: destinationAccount.balanceId,
          amount: destinationAmount,
          twoPhaseCommit: true
        }
      )
    }
    const error = await this.balanceService.createTransfers(transfers)
    if (error) {
      switch (error.code) {
        case CreateTransferError.debit_account_not_found:
          if (error.index === 1) {
            throw new UnknownLiquidityAccountError(destinationAccount.asset)
          }
          throw new UnknownBalanceError(sourceAccountId)
        case CreateTransferError.credit_account_not_found:
          if (error.index === 1) {
            throw new UnknownBalanceError(destinationAccountId)
          }
          throw new UnknownLiquidityAccountError(sourceAccount.asset)
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
        const res = await this.balanceService.commitTransfers(
          transfers.map((transfer) => transfer.id)
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
        const res = await this.balanceService.rollbackTransfers(
          transfers.map((transfer) => transfer.id)
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

  /** TODO: Base64 encode/decode the cursors
   * Buffer.from("Hello World").toString('base64')
   * Buffer.from("SGVsbG8gV29ybGQ=", 'base64').toString('ascii')
   */

  /** getAccountsPage
   * The pagination algorithm is based on the Relay connection specification.
   * Please read the spec before changing things:
   * https://relay.dev/graphql/connections.htm
   * @param options
   * @param options.pagination Pagination - cursors and limits.
   * @param options.superAccountId String - id of account to get sub-accounts of.
   * @returns IlpAccount[] An array of accounts that form a page.
   */
  async getAccountsPage({
    pagination,
    superAccountId
  }: {
    pagination?: Pagination
    superAccountId?: string
  }): Promise<IlpAccount[]> {
    if (
      typeof pagination?.before === 'undefined' &&
      typeof pagination?.last === 'number'
    )
      throw new Error("Can't paginate backwards from the start.")

    const first = pagination?.first || 20
    if (first < 0 || first > 100) throw new Error('Pagination index error')
    const last = pagination?.last || 20
    if (last < 0 || last > 100) throw new Error('Pagination index error')

    /**
     * Forward pagination
     */
    if (typeof pagination?.after === 'string') {
      const accounts = await IlpAccountModel.query()
        .withGraphFetched('asset(codeAndScale)')
        .where(
          superAccountId
            ? {
                superAccountId
              }
            : {}
        )
        .whereRaw(
          '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "ilpAccounts" where "id" = ?)',
          [pagination.after]
        )
        .orderBy([
          { column: 'createdAt', order: 'asc' },
          { column: 'id', order: 'asc' }
        ])
        .limit(first)
      return accounts.map((account) => toIlpAccount(account))
    }

    /**
     * Backward pagination
     */
    if (typeof pagination?.before === 'string') {
      const accounts = await IlpAccountModel.query()
        .withGraphFetched('asset(codeAndScale)')
        .where(
          superAccountId
            ? {
                superAccountId
              }
            : {}
        )
        .whereRaw(
          '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "ilpAccounts" where "id" = ?)',
          [pagination.before]
        )
        .orderBy([
          { column: 'createdAt', order: 'desc' },
          { column: 'id', order: 'desc' }
        ])
        .limit(last)
        .then((resp) => {
          return resp.reverse()
        })
      return accounts.map((account) => toIlpAccount(account))
    }

    const accounts = await IlpAccountModel.query()
      .withGraphFetched('asset(codeAndScale)')
      .where(
        superAccountId
          ? {
              superAccountId
            }
          : {}
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
    return accounts.map((account) => toIlpAccount(account))
  }
}
