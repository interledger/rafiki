import {
  NotFoundError,
  PartialModelObject,
  raw,
  UniqueViolationError
} from 'objection'
import * as uuid from 'uuid'

import { AssetService, Asset } from '../asset/service'
import {
  BalanceOptions,
  BalanceService,
  calculateCreditBalance,
  calculateDebitBalance
} from '../balance/service'
import { Token, TokenError, TokenService } from '../token/service'
import { BaseService } from '../shared/baseService'
import { UnknownBalanceError } from '../shared/errors'
import { randomId } from '../shared/utils'
import { UnknownAssetError } from './errors'
import { IlpAccount, SubAccount } from './model'

export { IlpAccount, SubAccount }

export interface IlpBalance {
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

export interface Pagination {
  after?: string // Forward pagination: cursor.
  before?: string // Backward pagination: cursor.
  first?: number // Forward pagination: limit.
  last?: number // Backward pagination: limit.
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
  asset: Asset
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

export enum AccountError {
  DuplicateAccountId = 'DuplicateAccountId',
  DuplicateIncomingToken = 'DuplicateIncomingToken',
  UnknownAccount = 'UnknownAccount',
  UnknownSuperAccount = 'UnknownSuperAccount'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccountError = (o: any): o is AccountError =>
  Object.values(AccountError).includes(o)

interface Peer {
  accountId: string
  ilpAddress: string
}

const UUID_LENGTH = 36

export interface AccountService {
  create(account: CreateOptions): Promise<IlpAccount | AccountError>
  update(accountOptions: UpdateOptions): Promise<IlpAccount | AccountError>
  get(accountId: string): Promise<IlpAccount | undefined>
  getAccounts(ids: string[]): Promise<IlpAccount[]>
  getByDestinationAddress(
    destinationAddress: string
  ): Promise<IlpAccount | undefined>
  getByToken(token: string): Promise<IlpAccount | undefined>
  getSubAccounts(accountId: string): Promise<IlpAccount[]>
  getWithSuperAccounts(accountId: string): Promise<IlpAccount | undefined>
  getAddress(accountId: string): Promise<string | undefined>
  getBalance(accountId: string): Promise<IlpBalance | undefined>
  getPage(options: {
    pagination?: Pagination
    superAccountId?: string
  }): Promise<IlpAccount[]>
}

interface ServiceDependencies extends BaseService {
  assetService: AssetService
  balanceService: BalanceService
  tokenService: TokenService
  ilpAddress?: string
  peerAddresses: Peer[]
}

export function createAccountService({
  logger,
  assetService,
  balanceService,
  tokenService,
  ilpAddress,
  peerAddresses
}: ServiceDependencies): AccountService {
  const log = logger.child({
    service: 'AccountService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    assetService,
    balanceService,
    tokenService,
    ilpAddress,
    peerAddresses
  }
  return {
    create: (account) => createAccount(deps, account),
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
    getPage: (options) => getAccountsPage(deps, options)
  }
}

async function createAccount(
  deps: ServiceDependencies,
  account: CreateOptions
): Promise<IlpAccount | AccountError> {
  const newAccount: PartialModelObject<IlpAccount> = {
    ...account,
    asset: undefined
  }
  // Don't rollback creating a new asset if account creation fails.
  // Asset rows include a smallserial column that would have sequence gaps
  // if a transaction is rolled back.
  // https://www.postgresql.org/docs/current/datatype-numeric.html#DATATYPE-SERIAL
  if (isSubAccount(account)) {
    const superAccount = await IlpAccount.query()
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

  const trx = await IlpAccount.startTransaction()
  try {
    const newBalances: BalanceOptions[] = []
    const superAccountPatch: PartialModelObject<IlpAccount> = {}
    if (isSubAccount(account)) {
      const superAccount = await IlpAccount.query(trx)
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
        !superAccount.creditExtendedBalanceId !== !superAccount.lentBalanceId
      ) {
        deps.logger.warn(superAccount, 'missing super-account balance')
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

    await deps.balanceService.create(newBalances)

    if (isSubAccount(account)) {
      await IlpAccount.query(trx)
        .patch(superAccountPatch)
        .findById(account.superAccountId)
        .throwIfNotFound()
    }

    const accountRow = await IlpAccount.query(trx).insertAndFetch(newAccount)

    const incomingTokens = account.http?.incoming?.authTokens.map(
      (incomingToken: string): Token => {
        return {
          accountId: accountRow.id,
          token: incomingToken
        }
      }
    )
    if (incomingTokens) {
      const err = await deps.tokenService.create(incomingTokens, trx)
      if (err) {
        if (err === TokenError.DuplicateToken) {
          trx.rollback()
          return AccountError.DuplicateIncomingToken
        }
        throw new Error(err)
      }
    }
    trx.commit()
    return accountRow
  } catch (err) {
    trx.rollback()
    if (
      err instanceof UniqueViolationError &&
      err.constraint === 'ilpAccounts_pkey'
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
): Promise<IlpAccount | AccountError> {
  const trx = await IlpAccount.startTransaction()
  try {
    if (accountOptions.http?.incoming?.authTokens) {
      await deps.tokenService.delete(accountOptions.id, trx)
      const incomingTokens = accountOptions.http.incoming.authTokens.map(
        (incomingToken: string): Token => {
          return {
            accountId: accountOptions.id,
            token: incomingToken
          }
        }
      )
      const err = await deps.tokenService.create(incomingTokens, trx)
      if (err) {
        if (err === TokenError.DuplicateToken) {
          trx.rollback()
          return AccountError.DuplicateIncomingToken
        }
        throw new Error(err)
      }
    }
    const account = await IlpAccount.query()
      .patchAndFetchById(accountOptions.id, accountOptions)
      .throwIfNotFound()
    const asset = await deps.assetService.getById(account.assetId)
    if (!asset) {
      throw new UnknownAssetError(account.id)
    }
    account.asset = asset
    trx.commit()
    return account
  } catch (err) {
    trx.rollback()
    if (err instanceof NotFoundError) {
      return AccountError.UnknownAccount
    }
    throw err
  }
}

async function getAccount(
  deps: ServiceDependencies,
  accountId: string
): Promise<IlpAccount | undefined> {
  const account = await IlpAccount.query()
    .findById(accountId)
    .withGraphJoined('asset')

  return account || undefined
}

async function getAccounts(
  deps: ServiceDependencies,
  ids: string[]
): Promise<IlpAccount[]> {
  return await IlpAccount.query().findByIds(ids).withGraphJoined('asset')
}

async function getSubAccounts(
  deps: ServiceDependencies,
  accountId: string
): Promise<IlpAccount[]> {
  const account = await IlpAccount.query()
    .withGraphJoined('subAccounts.asset')
    .findById(accountId)
    .select('subAccounts')

  return account && account.subAccounts ? account.subAccounts : []
}

async function getAccountWithSuperAccounts(
  deps: ServiceDependencies,
  accountId: string
): Promise<IlpAccount | undefined> {
  const account = await IlpAccount.query()
    .withGraphFetched(`superAccount.^`, {
      minimize: true
    })
    .findById(accountId)
  return account || undefined
}

async function getAccountBalance(
  deps: ServiceDependencies,
  accountId: string
): Promise<IlpBalance | undefined> {
  const account = await IlpAccount.query()
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

async function getAccountByToken(
  deps: ServiceDependencies,
  token: string
): Promise<IlpAccount | undefined> {
  const account = await IlpAccount.query()
    .withGraphJoined('[asset(codeAndScale), incomingTokens]')
    .where('incomingTokens.token', token)
    .first()
  return account || undefined
}

async function getAccountByStaticIlpAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<IlpAccount | undefined> {
  const account = await IlpAccount.query()
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
  return account || undefined
}

async function getAccountByPeerAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<IlpAccount | undefined> {
  const peerAddress = deps.peerAddresses.find(
    (peer: Peer) =>
      destinationAddress.startsWith(peer.ilpAddress) &&
      (destinationAddress.length === peer.ilpAddress.length ||
        destinationAddress[peer.ilpAddress.length] === '.')
  )
  if (peerAddress) {
    const account = await IlpAccount.query()
      .findById(peerAddress.accountId)
      .withGraphJoined('asset(codeAndScale)')
    return account || undefined
  }
}

async function getAccountByServerAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<IlpAccount | undefined> {
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
      if (uuid.validate(accountId) && uuid.version(accountId) === 4) {
        const account = await IlpAccount.query()
          .findById(accountId)
          .withGraphJoined('asset(codeAndScale)')
        return account || undefined
      }
    }
  }
}

async function getAccountByDestinationAddress(
  deps: ServiceDependencies,
  destinationAddress: string
): Promise<IlpAccount | undefined> {
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
  const account = await IlpAccount.query()
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
async function getAccountsPage(
  deps: ServiceDependencies,
  {
    pagination,
    superAccountId
  }: {
    pagination?: Pagination
    superAccountId?: string
  }
): Promise<IlpAccount[]> {
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
    const accounts = await IlpAccount.query()
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
    return accounts
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    const accounts = await IlpAccount.query()
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
    return accounts
  }

  const accounts = await IlpAccount.query()
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
  return accounts
}
