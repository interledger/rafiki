import { Factory, IFactory } from 'rosie'
import { Logger } from 'pino'

export const TestLoggerFactory: IFactory<Logger> = Factory.define<Logger>(
  'TestLogger'
).attrs({
  debug: () => jest.fn(),
  fatal: () => jest.fn(),
  error: () => jest.fn(),
  warn: () => jest.fn(),
  info: () => jest.fn(),
  trace: () => jest.fn(),
  child: () => jest.fn().mockImplementation(() => TestLoggerFactory.build())
})
