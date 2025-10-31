import { IocContract } from '@adonisjs/fold'

import { App, AppServices } from '../app'

export interface TestContainer {
  cardServicePort: number
  app: App
  shutdown: () => Promise<void>
  container: IocContract<AppServices>
}

export const createTestApp = async (
  container: IocContract<AppServices>
): Promise<TestContainer> => {
  const config = await container.use('config')
  config.cardServicePort = 0

  const app = new App(container)
  await app.boot()
  await app.startCardServiceServer(config.cardServicePort)

  return {
    app,
    cardServicePort: app.getCardServicePort(),
    shutdown: async () => {
      await app.shutdown()
    },
    container
  }
}
