import createLogger, { Logger as PinoLogger } from 'pino'

import { Config } from '../config/app'

function initLogger(): PinoLogger {
  const logger = createLogger()
  logger.level = Config.logLevel
  return logger
}

export const Logger = initLogger()
