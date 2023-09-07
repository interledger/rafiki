import { Knex } from 'knex'
import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

import { PeerService } from './service'
import { Config } from '../config/app'
import { createTestApp, TestContainer } from '../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { createAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'
import { Peer } from './model'
import { isPeerError } from './errors'
import { WebhookEvent } from '../webhook/model'
import { Asset } from '../asset/model'

describe('Peer Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let peerService: PeerService
  let knex: Knex
  let asset: Asset

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    peerService = await deps.use('peerService')
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('onDebit', (): void => {
    let peer: Peer
    beforeEach(async (): Promise<void> => {
      const options = {
        assetId: asset.id,
        http: {
          incoming: {
            authTokens: [faker.string.sample(32)]
          },
          outgoing: {
            authToken: faker.string.sample(32),
            endpoint: faker.internet.url({ appendSlash: false })
          }
        },
        maxPacketAmount: BigInt(100),
        staticIlpAddress: 'test.' + uuid(),
        name: faker.person.fullName(),
        liquidityThreshold: BigInt(100)
      }
      const peerOrError = await peerService.create(options)
      if (!isPeerError(peerOrError)) {
        peer = peerOrError
      }
    })
    test.each`
      balance
      ${BigInt(50)}
      ${BigInt(99)}
      ${BigInt(100)}
    `(
      'creates webhook event if balance=$balance <= liquidityThreshold',
      async ({ balance }): Promise<void> => {
        await peer.onDebit({ balance })
        const event = (
          await WebhookEvent.query(knex).where('type', 'peer-liquidity')
        )[0]
        console.log(event)
        expect(event).toMatchObject({
          type: 'peer-liquidity',
          data: {
            id: peer.id,
            asset: {
              id: asset.id,
              code: asset.code,
              scale: asset.scale
            },
            liquidityThreshold: peer.liquidityThreshold?.toString(),
            balance: balance.toString()
          }
        })
      }
    )
    test('does not create webhook event if balance > liquidityThreshold', async (): Promise<void> => {
      await peer.onDebit({ balance: BigInt(110) })
      await expect(
        WebhookEvent.query(knex).where('type', 'peer-liquidity')
      ).resolves.toEqual([])
    })
  })
})
