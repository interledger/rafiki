import { Factory } from 'rosie'
import { LoggingService } from '../index'

export const TestLoggerFactory = Factory.define<LoggingService>(
  'TestLogger'
).attrs({
  debug: () => jest.fn(),
  fatal: () => jest.fn(),
  error: () => jest.fn(),
  warn: () => jest.fn(),
  info: () => jest.fn(),
  trace: () => jest.fn()
})
