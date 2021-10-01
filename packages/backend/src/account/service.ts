import assert from 'assert'
import {
  NotFoundError,
  PartialModelObject,
  raw,
  Transaction,
  UniqueViolationError
} from 'objection'
import { v4 as uuid } from 'uuid'

import { AssetService, AssetOptions } from '../asset/service'
import { BalanceOptions, BalanceService } from '../balance/service'
import { HttpTokenOptions, HttpTokenService } from '../httpToken/service'
import { HttpTokenError } from '../httpToken/errors'
import { BaseService } from '../shared/baseService'
import {
  BalanceTransferError,
  UnknownBalanceError,
  UnknownLiquidityAccountError
} from '../shared/errors'
import { Pagination } from '../shared/pagination'
import { validateId } from '../shared/utils'
import { TransferService, TwoPhaseTransfer } from '../transfer/service'
import { TransferError, TransfersError } from '../transfer/errors'
import { AccountError, AccountTransferError, UnknownAssetError } from './errors'
import { Account, SubAccount } from './model'

export { Account, SubAccount }

export interface AccountBalance {
  balance: bigint
  // Remaining credit line available from the super-account
  availableCredit: bigint
  // Total (un-utilized) credit lines extended to all sub-accounts
  creditExtended: bigint
  // Outstanding amount borrowed from the super-account
  totalBorrowed: bigint
  // Total amount lent, or amount owed to this account across all its sub-accounts
  totalLent: bigint
}

export type Options = {
  id?: string
  disabled?: boolean
  stream?: {
    enabled: boolean
  }
  http?: {
    incoming?: {
      authTokens: string[]
    }
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  routing?: {
    staticIlpAddress: string // ILP address for this account
  }
  maxPacketAmount?: bigint
}

export type CreateAccountOptions = Options & {
  asset: AssetOptions
  superAccountId?: never
}

export type CreateSubAccountOptions = Options & {
  asset?: never
  superAccountId: string
}

export type CreateOptions = CreateAccountOptions | CreateSubAccountOptions

export type UpdateOptions = Options & {
  id: string
}

export function isSubAccount(
  account: CreateOptions
): account is CreateSubAccountOptions {
  return (account as CreateSubAccountOptions).superAccountId !== undefined
}

interface Peer {
  accountId: string
  ilpAddress: string
}

export interface AccountTransferOptions {
  sourceAccount: Account
  destinationAccount: Account
  sourceAmount: bigint
  destinationAmount?: bigint
  timeout: bigint // nano-seconds
}

export interface AccountTransfer {
  commit: () => Promise<void | AccountTransferError>
  rollback: () => Promise<void | AccountTransferError>
}

const UUID_LENGTH = 36

export interface AccountService {
  create(
    account: CreateOptions,
    trx?: Transaction
  ): Promise<Account | AccountError>
  update(accountOptions: UpdateOptions): Promise<Account | AccountError>
  get(accountId: string): Promise<Account | undefined>
  getAccounts(ids: string[]): Promise<Account[]>
  getByDestinationAddress(
    destinationAddress: string
  ): Promise<Account | undefined>
  getByToken(token: string): Promise<Account | undefined>
  getSubAccounts(accountId: string): Promise<Account[]>
  getWithSuperAccounts(accountId: string): Promise<Account | undefined>
  getAddress(accountId: string): Promise<string | undefined>
  getBalance(accountId: string): Promise<AccountBalance | undefined>
  getPage(options: {
    pagination?: Pagination
    superAccountId?: string
  }): Promise<Account[]>
  transferFunds(
    options: AccountTransferOptions
  ): Promise<AccountTransfer | AccountTransferError>
}

interface ServiceDependencies extends BaseService {
  assetService: AssetService
  balanceService: BalanceService
  httpTokenService: HttpTokenService
  transferService: TransferService
  ilpAddress?: string
  peerAddresses: Peer[]
}

export function createAccountService({
  logger,
  knex,
  assetService,
  balanceService,
  httpTokenService,
  transferService,
  ilpAddress,
  peerAddresses
}: ServiceDependencies): AccountService {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    knex: knex,
    assetService,
    balanceService,
    httpTokenService,
    transferService,
    ilpAddress,
    peerAddresses
  }
  return {
    create: (account, trx) => createAccount(deps, account, trx),
    update: (account) => updateAccount(deps, account),
    get: (id) => getAccount(deps, id),
    getAccounts: (ids) => getAccounts(deps, ids),
    getByDestinationAddress: (destinationAddress) =>
      getAccountByDestinationAddress(deps, destinationAddress),
    getByToken: (token) => getAccountByToken(deps, token),
    getAddress: (id) => getAccountAddress(deps, id),
    getSubAccounts: (id) => getSubAccounts(deps, id),
    getWithSuperAccounts: (id) => getAccountWithSuperAccounts(deps, id),
    getBalance: (id) => getAccountBalance(deps, id),
    getPage: (options) => getAccountsPage(deps, options),
    transferFunds: (options) => transferFunds(deps, options)
  }
}

async function createAccount(
  deps: ServiceDependencies,
  account: CreateOptions,
  trx?: Transaction
): Promise<Account | AccountError> {
  const newAccount: PartialModelObject<Account> = {
    ...account,
    asset: undefined
  }
  // Don't rollback creating a new asset if account creation fails.
  // Asset rows include a smallserial column that would have sequence gaps
  // if a transaction is rolled back.
  // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
  if (isSubAccount(account)) {
    const superAccount = await Account.query(trx || deps.knex)
      .findById(account.superAccountId)
      .withGraphFetched('asset')
    if (!superAccount) {
      return AccountError.UnknownSuperAccount
    }
    newAccount.assetId = superAccount.assetId
    newAccount.asset = superAccount.asset
  } else {
    newAccount.asset = await deps.assetService.getOrCreate(account.asset)
    newAccount.assetId = newAccount.asset.id
  }
  assert.ok(newAccount.asset)

  const acctTrx = trx || (await Account.startTransaction())
  try {
    const newBalances: BalanceOptions[] = []
    const superAccountPatch: PartialModelObject<Account> = {}
    if (isSubAccount(account)) {
      const superAccount = await Account.query(acctTrx)
        .findById(account.superAccountId)
        .withGraphFetched('asset')
        .forUpdate()
        .throwIfNotFound()
      newAccount.creditBalanceId = uuid()
      newAccount.debtBalanceId = uuid()
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
        !superAccount.creditExtendedBalanceId !== !superAccount.lentBalanceId
      ) {
        deps.logger.warn(superAccount, 'missing super-account balance')
      }
      if (!superAccount.creditExtendedBalanceId) {
        superAccountPatch.creditExtendedBalanceId = uuid()
        newBalances.push({
          id: superAccountPatch.creditExtendedBalanceId,
          debitBalance: true,
          unit: superAccount.asset.unit
        })
      }
      if (!superAccount.lentBalanceId) {
        superAccountPatch.lentBalanceId = uuid()
        newBalances.push({
          id: superAccountPatch.lentBalanceId,
          debitBalance: true,
          unit: superAccount.asset.unit
        })
      }
    }

    newAccount.balanceId = uuid()
    newBalances.push({
      id: newAccount.balanceId,
      unit: newAccount.asset.unit
    })

    await deps.balanceService.create(newBalances)

    if (isSubAccount(account)) {
      await Account.query(acctTrx)
        .patch(superAccountPatch)
        .findById(account.superAccountId)
        .throwIfNotFound()
    }

    const accountRow = await Account.query(acctTrx).insertAndFetch(newAccount)

    const incomingTokens = account.http?.incoming?.authTokens.map(
      (incomingToken: string): HttpTokenOptions => {
        return {
          accountId: accountRow.id,
          token: incomingToken
        }
      }
    )
    if (incomingTokens) {
      const err = await deps.httpTokenService.create(incomingTokens, acctTrx)
      if (err) {
        if (err === HttpTokenError.DuplicateToken) {
          if (!trx) {
            await acctTrx.rollback()
          }
          return AccountError.DuplicateIncomingToken
        }
        throw new Error(err)
      }
    }
    if (!trx) {
      await acctTrx.commit()
    }
    return accountRow
  } catch (err) {
    if (!trx) {
      await acctTrx.rollback()
    }
    if (
      err instanceof UniqueViolationError &&
      err.constraint === 'accounts_pkey'
    ) {
      return AccountError.DuplicateAccountId
    } else if (err instanceof NotFoundError) {
      return AccountError.UnknownSuperAccount
    }
    throw err
  }
}

async function updateAccount(
  deps: ServiceDependencies,
  accountOptions: UpdateOptions
): Promise<Account | AccountError> {
  const trx = await Account.startTransaction()
  try {
    if (accountOptions.http?.incoming?.authTokens) {
      await deps.httpTokenService.deleteByAccount(accountOptions.id, trx)
      const incomingTokens = accountOptions.http.incoming.authTokens.map(
        (incomingToken: string): HttpTokenOptions => {
          return {
            accountId: accountOptions.id,
            token: incomingToken
          }
        }
      )
      const err = await deps.httpTokenService.create(incomingTokens, trx)
      if (err) {
        if (err === HttpTokenError.DuplicateToken) {
          await trx.rollback()
          return AccountError.DuplicateIncomingToken
        }
        throw new Error(err)
      }
    }
    const account = await Account.query(deps.knex)
      .patchAndFetchById(accountOptions.id, accountOptions)
      .throwIfNotFound()
    const asset = await deps.assetService.getById(account.assetId)
    if (!asset) {
      throw new UnknownAssetError(account.id)
    }
    account.asset = asset
    await trx.commit()
    return account
  } catch (err) {
    await trx.rollback()
    if (err instanceof NotFoundError) {
      return AccountError.UnknownAccount
    }
    throw err
  }
}

async function getAccount(
  deps: ServiceDependencies,
  accountId: string
): Promise<Account | undefined> {
  const account = await Account.query(deps.knex)
    .findById(accountId)
    .withGraphJoined('asset')

  return account || undefined
}

async function getAccounts(
  deps: ServiceDependencies,
  ids: string[]
): Promise<Account[]> {
  return await Account.query(deps.knex).findByIds(ids).withGraphJoined('asset')
}

async function getSubAccounts(
  deps: ServiceDependencies,
  accountId: string
): Promise<Account[]> {
  const account = await Account.query(deps.knex)
    .withGraphJoined('subAccounts.asset')
    .findById(accountId)
    .select('subAccounts')

  return account && account.subAccounts ? account.subAccounts : []
}

async function getAccountWithSuperAccounts(
  deps: ServiceDependencies,
  accountId: string
): Promise<Account | undefined> {
  const account = await Account.query(deps.knex)
    .withGraphFetched(`superAccount.^`, {
      minimize: true
    })
    .findById(accountId)
  return account || undefined
}

async function getAccountBalance(
  deps: ServiceDependencies,
  accountId: string
): Promise<AccountBalance | undefined> {
  const account = await Account.query(deps.knex)
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
  const balances = await deps.balanceService.get(balanceIds)

  if (balances.length === 0) {
    throw new UnknownBalanceError(accountId)
  }

  const accountBalance: AccountBalance = {
    balance: BigInt(0),
    availableCredit: BigInt(0),
    creditExtended: BigInt(0),
    totalBorrowed: BigInt(0),
    totalLent: BigInt(0)
  }

  balances.forEach(({ id, balance }) => {
    switch (id) {
      case account.balanceId:
        accountBalance.balance = balance
        break
      case account.creditBalanceId:
        accountBalance.availableCredit = balance
        break
      case account.creditExtendedBalanceId:
        accountBalance.creditExtended = balance
        break
      case account.debtBalanceId:
        accountBalance.totalBorrowed = balance
        break
      case account.lentBalanceId:
        accountBalance.totalLent = balance
        break
    }
  })

  return accountBalance
}

async function getAccountByToken(
  deps: ServiceDependencies,
  token: string
): Promise<Account | undefined> {
  const account = await Account.query(deps.knex)
    .withGraphJoined('[asset, incomingTokens]')
    .where('incomingTokens.token', token)
    .first()
  return account || undefined
}

async function getAccountByStaticIlpAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<Account | undefined> {
  const account = await Account.query(deps.knex)
    // new RegExp('^' + staticIlpAddress + '($|\\.)'))
    .withGraphJoined('asset')
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
  return account || undefined
}

async function getAccountByPeerAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<Account | undefined> {
  const peerAddress = deps.peerAddresses.find(
    (peer: Peer) =>
      destinationAddress.startsWith(peer.ilpAddress) &&
      (destinationAddress.length === peer.ilpAddress.length ||
        destinationAddress[peer.ilpAddress.length] === '.')
  )
  if (peerAddress) {
    const account = await Account.query(deps.knex)
      .findById(peerAddress.accountId)
      .withGraphJoined('asset')
    return account || undefined
  }
}

async function getAccountByServerAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<Account | undefined> {
  if (deps.ilpAddress) {
    if (
      destinationAddress.startsWith(deps.ilpAddress + '.') &&
      (destinationAddress.length === deps.ilpAddress.length + 1 + UUID_LENGTH ||
        destinationAddress[deps.ilpAddress.length + 1 + UUID_LENGTH] === '.')
    ) {
      const accountId = destinationAddress.slice(
        deps.ilpAddress.length + 1,
        deps.ilpAddress.length + 1 + UUID_LENGTH
      )
      if (validateId(accountId)) {
        const account = await Account.query(deps.knex)
          .findById(accountId)
          .withGraphJoined('asset')
        return account || undefined
      }
    }
  }
}

async function getAccountByDestinationAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<Account | undefined> {
  return (
    (await getAccountByStaticIlpAddress(deps, destinationAddress)) ||
    (await getAccountByPeerAddress(deps, destinationAddress)) ||
    (await getAccountByServerAddress(deps, destinationAddress))
  )
}

async function getAccountAddress(
  deps: ServiceDependencies,
  accountId: string
): Promise<string | undefined> {
  const account = await Account.query(deps.knex)
    .findById(accountId)
    .select('staticIlpAddress')
  if (!account) {
    return undefined
  } else if (account.routing?.staticIlpAddress) {
    return account.routing.staticIlpAddress
  }
  const idx = deps.peerAddresses.findIndex(
    (peer: Peer) => peer.accountId === accountId
  )
  if (idx !== -1) {
    return deps.peerAddresses[idx].ilpAddress
  }
  if (deps.ilpAddress) {
    return deps.ilpAddress + '.' + accountId
  }
}

async function transferFunds(
  deps: ServiceDependencies,
  {
    sourceAccount,
    destinationAccount,
    sourceAmount,
    destinationAmount,
    timeout
  }: AccountTransferOptions
): Promise<AccountTransfer | AccountTransferError> {
  if (sourceAccount.id === destinationAccount.id) {
    return AccountTransferError.SameAccounts
  }
  if (sourceAmount <= BigInt(0)) {
    return AccountTransferError.InvalidSourceAmount
  }
  if (destinationAmount !== undefined && destinationAmount <= BigInt(0)) {
    return AccountTransferError.InvalidDestinationAmount
  }
  const transfers: TwoPhaseTransfer[] = []

  if (
    sourceAccount.asset.code === destinationAccount.asset.code &&
    sourceAccount.asset.scale === destinationAccount.asset.scale
  ) {
    transfers.push({
      id: uuid(),
      sourceBalanceId: sourceAccount.balanceId,
      destinationBalanceId: destinationAccount.balanceId,
      amount:
        destinationAmount && destinationAmount < sourceAmount
          ? destinationAmount
          : sourceAmount,
      timeout
    })
    if (destinationAmount && sourceAmount !== destinationAmount) {
      if (destinationAmount < sourceAmount) {
        transfers.push({
          id: uuid(),
          sourceBalanceId: sourceAccount.balanceId,
          destinationBalanceId: sourceAccount.asset.liquidityBalanceId,
          amount: sourceAmount - destinationAmount,
          timeout
        })
      } else {
        transfers.push({
          id: uuid(),
          sourceBalanceId: destinationAccount.asset.liquidityBalanceId,
          destinationBalanceId: destinationAccount.balanceId,
          amount: destinationAmount - sourceAmount,
          timeout
        })
      }
    }
  } else {
    if (!destinationAmount) {
      return AccountTransferError.InvalidDestinationAmount
    }
    transfers.push(
      {
        id: uuid(),
        sourceBalanceId: sourceAccount.balanceId,
        destinationBalanceId: sourceAccount.asset.liquidityBalanceId,
        amount: sourceAmount,
        timeout
      },
      {
        id: uuid(),
        sourceBalanceId: destinationAccount.asset.liquidityBalanceId,
        destinationBalanceId: destinationAccount.balanceId,
        amount: destinationAmount,
        timeout
      }
    )
  }
  const error = await deps.transferService.create(transfers)
  if (error) {
    switch (error.error) {
      case TransferError.UnknownSourceBalance:
        if (error.index === 1) {
          throw new UnknownLiquidityAccountError(destinationAccount.asset)
        }
        throw new UnknownBalanceError(sourceAccount.id)
      case TransferError.UnknownDestinationBalance:
        if (error.index === 1) {
          throw new UnknownBalanceError(destinationAccount.id)
        }
        throw new UnknownLiquidityAccountError(sourceAccount.asset)
      case TransferError.InsufficientBalance:
        if (error.index === 1) {
          return AccountTransferError.InsufficientLiquidity
        }
        return AccountTransferError.InsufficientBalance
      default:
        throw new BalanceTransferError(error.error)
    }
  }

  const trx: AccountTransfer = {
    commit: async (): Promise<void | AccountTransferError> => {
      const error = await deps.transferService.commit(
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return toAccountTransferError(error)
      }
    },
    rollback: async (): Promise<void | AccountTransferError> => {
      const error = await deps.transferService.rollback(
        transfers.map((transfer) => transfer.id)
      )
      if (error) {
        return toAccountTransferError(error)
      }
    }
  }
  return trx
}

function toAccountTransferError({
  error
}: TransfersError): AccountTransferError {
  switch (error) {
    case TransferError.TransferExpired:
      return AccountTransferError.TransferExpired
    case TransferError.AlreadyCommitted:
      return AccountTransferError.AlreadyCommitted
    case TransferError.AlreadyRolledBack:
      return AccountTransferError.AlreadyRolledBack
    default:
      throw new BalanceTransferError(error)
  }
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
 * @returns Account[] An array of accounts that form a page.
 */
async function getAccountsPage(
  deps: ServiceDependencies,
  {
    pagination,
    superAccountId
  }: {
    pagination?: Pagination
    superAccountId?: string
  }
): Promise<Account[]> {
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
    const accounts = await Account.query(deps.knex)
      .withGraphFetched('asset')
      .where(
        superAccountId
          ? {
              superAccountId
            }
          : {}
      )
      .whereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "accounts" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
    return accounts
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    const accounts = await Account.query(deps.knex)
      .withGraphFetched('asset')
      .where(
        superAccountId
          ? {
              superAccountId
            }
          : {}
      )
      .whereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "accounts" where "id" = ?)',
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
    return accounts
  }

  const accounts = await Account.query(deps.knex)
    .withGraphFetched('asset')
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
  return accounts
}
