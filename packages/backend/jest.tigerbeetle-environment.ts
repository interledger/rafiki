import { startTigerBeetleContainer } from './src/tests/tigerbeetle'
import { StartedTestContainer } from 'testcontainers'

import CustomTestEnvironment from './jest.custom-environment'

export default class TigerBeetleEnvironment extends CustomTestEnvironment {
  private tbContainer: StartedTestContainer | undefined

  public async setup(): Promise<void> {
    await super.setup()
    const tbContainer = await startTigerBeetleContainer()

    this.tbContainer = tbContainer.container
    this.global.tigerBeetlePort = tbContainer.port
  }

  public async teardown(): Promise<void> {
    await super.teardown()
    await this.tbContainer?.stop()
  }
}
