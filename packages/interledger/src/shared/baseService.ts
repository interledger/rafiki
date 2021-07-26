import { TransactionOrKnex } from 'objection'

import { Logger as PinoLogger } from '../logger/service'

type Logger = typeof PinoLogger

export interface BaseService {
  logger: Logger
  knex?: TransactionOrKnex
}
