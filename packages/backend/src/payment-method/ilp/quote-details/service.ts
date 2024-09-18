import { TransactionOrKnex } from 'objection'
// TODO: move IlpQuoteDetails to this dir
import { IlpQuoteDetails } from '../../../open_payments/quote/model'
import { BaseService } from '../../../shared/baseService'

export interface IlpQuoteDetailsService {
  getByQuoteId(quoteId: string): Promise<IlpQuoteDetails | undefined>
}

export interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createIlpQuoteDetailsService(
  deps_: ServiceDependencies
): Promise<IlpQuoteDetailsService> {
  const deps = {
    ...deps_,
    logger: deps_.logger.child({ service: 'IlpQuoteDetailsService' })
  }
  return {
    getByQuoteId: (quoteId: string) =>
      getIlpQuoteDetailsByQuoteId(deps, quoteId)
  }
}
async function getIlpQuoteDetailsByQuoteId(
  deps: ServiceDependencies,
  quoteId: string
): Promise<IlpQuoteDetails | undefined> {
  return await IlpQuoteDetails.query(deps.knex)
    .where('quoteId', quoteId)
    .first()
}
