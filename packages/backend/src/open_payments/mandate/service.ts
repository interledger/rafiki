import { parse, end } from 'iso8601-duration'
import { ForeignKeyViolationError, TransactionOrKnex, raw } from 'objection'

import { CreateError, RevokeError } from './errors'
import { Mandate } from './model'
import { RatesService } from '../../rates/service'
import { BaseService } from '../../shared/baseService'
import { Pagination } from '../../shared/pagination'

export interface CreateOptions {
  accountId: string
  amount: bigint
  assetCode: string
  assetScale: number
  startAt?: Date
  expiresAt?: Date
  interval?: string
}

export interface MandateService {
  create(options: CreateOptions): Promise<Mandate | CreateError>
  get(id: string): Promise<Mandate | undefined>
  getAccountMandatesPage(
    accountId: string,
    pagination?: Pagination
  ): Promise<Mandate[]>
  processNext(): Promise<string | undefined>
  revoke(id: string): Promise<Mandate | RevokeError>
  charge(
    id: string,
    amount: bigint,
    trx?: TransactionOrKnex
  ): Promise<Mandate | undefined>
  refund(
    id: string,
    amount: bigint,
    trx?: TransactionOrKnex
  ): Promise<Mandate | undefined>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
  ratesService: RatesService
}

export async function createMandateService(
  deps_: ServiceDependencies
): Promise<MandateService> {
  const log = deps_.logger.child({
    service: 'MandateService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    create: (options) => createMandate(deps, options),
    get: (id) => getMandate(deps, id),
    getAccountMandatesPage: (accountId, pagination) =>
      getAccountMandatesPage(deps, accountId, pagination),
    processNext: () => processNextMandate(deps),
    revoke: (id) => revokeMandate(deps, id),
    charge: (id, amount, trx) => chargeMandate(deps, id, amount, trx),
    refund: (id, amount, trx) => refundMandate(deps, id, amount, trx)
  }
}

async function createMandate(
  deps: ServiceDependencies,
  options: CreateOptions
): Promise<Mandate | CreateError> {
  if (options.interval) {
    try {
      parse(options.interval)
    } catch (e) {
      return CreateError.InvalidInterval
    }
  }
  const now = new Date()
  if (options.expiresAt && options.expiresAt < now) {
    return CreateError.InvalidExpiresAt
  }
  const prices = await deps.ratesService.prices()
  if (!prices[options.assetCode]) {
    return CreateError.UnknownAsset
  }
  const prestart = options.startAt && now < options.startAt
  try {
    return await deps.knex.transaction(async (trx) => {
      const mandate = await Mandate.query(trx)
        .insertAndFetch({
          ...options,
          balance: prestart ? BigInt(0) : options.amount,
          revoked: false
        })
        .withGraphFetched('account.asset')

      // Patch processAt in order to use createdAt in getIntervalEnd
      await mandate.$query(trx).patch({
        processAt: prestart ? options.startAt : getIntervalEnd(mandate)
      })
      return mandate
    })
  } catch (err) {
    if (err instanceof ForeignKeyViolationError) {
      return CreateError.UnknownAccount
    }
    throw err
  }
}

async function getMandate(
  deps: ServiceDependencies,
  id: string
): Promise<Mandate | undefined> {
  return Mandate.query(deps.knex).findById(id).withGraphJoined('account.asset')
}

// Start mandate interval or deactivate expired mandate.
// Returns the id of the processed mandate (if any).
async function processNextMandate(
  deps: ServiceDependencies
): Promise<string | undefined> {
  return deps.knex.transaction(async (trx) => {
    const mandates = await Mandate.query(trx)
      .limit(1)
      // Ensure the mandates cannot be processed concurrently by multiple workers.
      .forUpdate()
      // If a mandate is locked, don't wait — just come back for it later.
      .skipLocked()
      .andWhere('processAt', '<=', new Date().toISOString())
    const mandate = mandates[0]
    if (!mandate) return

    if (
      mandate.revoked ||
      (mandate.expiresAt && mandate.expiresAt <= new Date())
    ) {
      if (mandate.revoked) {
        deps.logger.warn(
          { mandate: mandate.id },
          'deactivating revoked mandate'
        )
      } else {
        deps.logger.trace(
          { mandate: mandate.id },
          'deactivating expired mandate'
        )
      }
      await mandate.$query(trx).patch({
        processAt: null,
        balance: BigInt(0)
      })
    } else {
      deps.logger.trace({ mandate: mandate.id }, 'starting mandate interval')
      await mandate.$query(trx).patch({
        processAt: getIntervalEnd(mandate),
        balance: mandate.amount
      })
    }

    return mandate.id
  })
}

async function revokeMandate(
  deps: ServiceDependencies,
  id: string
): Promise<Mandate | RevokeError> {
  return await deps.knex.transaction(async (trx) => {
    const mandate = await Mandate.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('account.asset')
    if (!mandate) return RevokeError.UnknownMandate
    if (mandate.revoked) return RevokeError.AlreadyRevoked
    if (mandate.expiresAt && mandate.expiresAt <= new Date())
      return RevokeError.AlreadyExpired
    await mandate.$query(trx).patch({
      revoked: true,
      processAt: null,
      balance: BigInt(0)
    })
    return mandate
  })
}

async function chargeMandate(
  deps: ServiceDependencies,
  id: string,
  amount: bigint,
  trx?: TransactionOrKnex
): Promise<Mandate | undefined> {
  return await Mandate.query(trx || deps.knex)
    .forUpdate()
    .where('id', id)
    .andWhere('balance', '>=', amount.toString())
    .patch({ balance: raw(`balance - ${amount.toString()}`) })
    .returning('*')
    .first()
}

async function refundMandate(
  deps: ServiceDependencies,
  id: string,
  amount: bigint,
  trx?: TransactionOrKnex
): Promise<Mandate | undefined> {
  const knex = trx || deps.knex
  return await knex.transaction(async (trx) => {
    const mandate = await Mandate.query(trx)
      .findById(id)
      .forUpdate()
      .withGraphFetched('account.asset')
    if (mandate) {
      let newBalance = mandate.balance + amount
      if (newBalance > mandate.amount) {
        deps.logger.warn(
          { mandate: mandate.id },
          'refund exceeds mandate balance limit'
        )
        newBalance = mandate.amount
      }
      await mandate.$query(trx).patch({
        balance: newBalance
      })
      return mandate
    }
  })
}

function getIntervalEnd(mandate: Mandate): Date | undefined {
  if (!mandate.interval) {
    return mandate.expiresAt
  } else {
    const intervalEnd = end(
      parse(mandate.interval),
      mandate.processAt || mandate.startAt || mandate.createdAt
    )
    if (mandate.expiresAt && mandate.expiresAt < intervalEnd) {
      return mandate.expiresAt
    }
    return intervalEnd
  }
}

/** TODO: Base64 encode/decode the cursors
 * Buffer.from("Hello World").toString('base64')
 * Buffer.from("SGVsbG8gV29ybGQ=", 'base64').toString('ascii')
 */

/** getAccountMandatesPage
 * The pagination algorithm is based on the Relay connection specification.
 * Please read the spec before changing things:
 * https://relay.dev/graphql/connections.htm
 * @param deps ServiceDependencies.
 * @param accountId The accountId of the mandates.
 * @param pagination Pagination - cursors and limits.
 * @returns Mandate[] An array of mandates that form a page.
 */
async function getAccountMandatesPage(
  deps: ServiceDependencies,
  accountId: string,
  pagination?: Pagination
): Promise<Mandate[]> {
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
    return Mandate.query(deps.knex)
      .where({
        accountId: accountId
      })
      .andWhereRaw(
        '("createdAt", "id") > (select "createdAt" :: TIMESTAMP, "id" from "mandates" where "id" = ?)',
        [pagination.after]
      )
      .orderBy([
        { column: 'createdAt', order: 'asc' },
        { column: 'id', order: 'asc' }
      ])
      .limit(first)
  }

  /**
   * Backward pagination
   */
  if (typeof pagination?.before === 'string') {
    return Mandate.query(deps.knex)
      .where({
        accountId: accountId
      })
      .andWhereRaw(
        '("createdAt", "id") < (select "createdAt" :: TIMESTAMP, "id" from "mandates" where "id" = ?)',
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
  }

  return Mandate.query(deps.knex)
    .where({
      accountId: accountId
    })
    .orderBy([
      { column: 'createdAt', order: 'asc' },
      { column: 'id', order: 'asc' }
    ])
    .limit(first)
}
