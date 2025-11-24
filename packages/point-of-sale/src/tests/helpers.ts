import { IAppConfig } from '../config/app'

export function withConfigOverride(
  getConfig: () => IAppConfig,
  configOverride: Partial<IAppConfig>,
  test: jest.Func
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return async (...args: any[]) => {
    const config = getConfig()
    const savedConfig = Object.assign({}, config)

    Object.assign(config, configOverride)

    try {
      await test(...args)
    } finally {
      Object.assign(config, savedConfig)
    }
  }
}
