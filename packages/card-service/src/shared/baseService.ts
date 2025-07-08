import { TransactionOrKnex } from 'objection'

import { Logger } from 'pino'

export interface BaseService {
  logger: Logger
  knex?: TransactionOrKnex
}
