export const logger = {
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  debug: () => jest.fn(),
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  fatal: () => jest.fn(),
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  error: () => jest.fn(),
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  warn: () => jest.fn(),
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  info: () => jest.fn(),
  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  trace: () => jest.fn()
}
