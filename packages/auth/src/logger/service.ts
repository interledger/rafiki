import createLogger, { Logger as PinoLogger } from 'pino'

import { Config } from '../config/app'

function initLogger(): PinoLogger {
  const logger = createLogger({
    redact: [
      'grant.continueToken',
      'headers.authorization',
      'accessToken.value',
      'requestBody.access_token'
    ]
  })
  logger.level = Config.logLevel
  return logger
}

export const Logger = initLogger()
