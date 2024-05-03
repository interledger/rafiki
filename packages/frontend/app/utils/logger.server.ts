import pino, { type LoggerOptions } from 'pino'

const logLevel = process.env.LOG_LEVEL || 'info'

const loggerOptions: LoggerOptions<never> = {
  level: logLevel
}

if (process.env.NODE_ENV === 'development') {
  loggerOptions.transport = { target: 'pino-pretty' }
}

export const logger = pino(loggerOptions)
