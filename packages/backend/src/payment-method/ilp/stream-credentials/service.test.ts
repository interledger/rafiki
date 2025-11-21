import { createTestApp, TestContainer } from '../../../tests/app'
import { StreamCredentialsService } from './service'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import assert from 'assert'

describe('Stream Credentials Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let streamCredentialsService: StreamCredentialsService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    streamCredentialsService = await deps.use('streamCredentialsService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('generates stream credentials', (): void => {
      const credentials = streamCredentialsService.get({
        ilpAddress: 'test.rafiki',
        paymentTag: crypto.randomUUID(),
        asset: {
          code: 'USD',
          scale: 2
        }
      })
      assert.ok(credentials)
      expect(credentials).toMatchObject({
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret: expect.any(Buffer)
      })
    })

    test('generates different stream credentials for a different ilpAddress', (): void => {
      const args = {
        paymentTag: crypto.randomUUID(),
        asset: {
          code: 'USD',
          scale: 2
        }
      }

      expect(
        streamCredentialsService.get({ ...args, ilpAddress: 'test.rafiki' })
          ?.ilpAddress
      ).not.toEqual(
        streamCredentialsService.get({
          ...args,
          ilpAddress: 'test.rafiki.sub-account'
        })?.ilpAddress
      )
    })
  })
})
