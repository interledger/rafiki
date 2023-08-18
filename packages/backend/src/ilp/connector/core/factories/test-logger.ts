import { Factory } from 'rosie'
import { Logger } from 'pino'

export const TestLoggerFactory = Factory.define<Logger>('TestLogger').attrs({
  debug: () => jest.fn(),
  fatal: () => jest.fn(),
  error: () => jest.fn(),
  warn: () => jest.fn(),
  info: () => jest.fn(),
  trace: () => jest.fn()
})
