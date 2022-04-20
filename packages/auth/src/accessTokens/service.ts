import { Transaction } from 'knex'
// import { TransactionOrKnex } from 'objection'
// import { BaseService } from '../shared/baseService'

// interface ServiceDependencies extends BaseService {
//   knex: TransactionOrKnex
// }

export interface AccessTokenService {
  create(trx?: Transaction): Promise<void>
}
