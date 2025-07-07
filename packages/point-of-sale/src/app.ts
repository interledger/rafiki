import { Knex } from 'knex'
import { Logger } from 'pino'
import { IAppConfig } from './config/app'

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  config: Promise<IAppConfig>
}