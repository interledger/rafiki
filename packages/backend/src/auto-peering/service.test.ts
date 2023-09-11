import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '..'
import { AppServices } from '../app'
import { Config, IAppConfig } from '../config/app'
import { PeerError } from '../peer/errors'
import { createTestApp, TestContainer } from '../tests/app'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { AutoPeeringError, isAutoPeeringError } from './errors'
import { AutoPeeringService } from './service'

describe('Auto Peering Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let autoPeeringService: AutoPeeringService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, enableAutoPeering: true })
    appContainer = await createTestApp(deps)
    config = await deps.use('config')
    autoPeeringService = await deps.use('autoPeeringService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('acceptPeeringRequest', () => {
    test('creates peer and resolves connection details', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken'
      }

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress
      })
    })

    test('resolves connection details even if duplicate peer', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken'
      }

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress
      })
      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress
      })
    })

    test('returns error if unknown asset', async (): Promise<void> => {
      const args = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: 'USD', scale: 2 },
        httpToken: 'someHttpToken'
      }

      await expect(autoPeeringService.acceptPeeringRequest(args)).resolves.toBe(
        AutoPeeringError.UnknownAsset
      )
    })

    test('returns error if invalid ILP connector address', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'invalid',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken'
      }

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual(AutoPeeringError.InvalidPeerIlpConfiguration)
    })

    test('returns error if invalid static ILP address', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args = {
        staticIlpAddress: 'invalid',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken'
      }

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual(AutoPeeringError.InvalidPeerIlpConfiguration)
    })

    test('returns error if other peer creation error', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken'
      }

      assert.ok(
        !isAutoPeeringError(await autoPeeringService.acceptPeeringRequest(args))
      )

      await expect(
        autoPeeringService.acceptPeeringRequest({
          ...args,
          staticIlpAddress: 'test.other-rafiki' // expecting to fail on DuplicateIncomingToken
        })
      ).resolves.toBe(AutoPeeringError.InvalidPeeringRequest)
    })
  })
})
