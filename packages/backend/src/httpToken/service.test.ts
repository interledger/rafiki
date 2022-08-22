import { Knex } from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { HttpTokenService } from './service'
import { HttpTokenError } from './errors'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { PeerFactory } from '../tests/peerFactory'
import { truncateTables } from '../tests/tableManager'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Peer } from '../peer/model'

describe('HTTP Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let httpTokenService: HttpTokenService
  let peerFactory: PeerFactory
  let peer: Peer
  let knex: Knex
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    deps.bind('messageProducer', async () => mockMessageProducer)
    appContainer = await createTestApp(deps)
    workerUtils = await makeWorkerUtils({
      connectionString: appContainer.connectionUrl
    })
    await workerUtils.migrate()
    messageProducer.setUtils(workerUtils)
    knex = await deps.use('knex')
    httpTokenService = await deps.use('httpTokenService')
    const peerService = await deps.use('peerService')
    peerFactory = new PeerFactory(peerService)
  })

  beforeEach(async (): Promise<void> => {
    peer = await peerFactory.build()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await resetGraphileDb(knex)
    await appContainer.shutdown()
    await workerUtils.release()
  })

  describe('Create or Get Tokens', (): void => {
    test('Tokens can be created and fetched', async (): Promise<void> => {
      const httpToken = {
        peerId: peer.id,
        token: uuid()
      }
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpToken.token)
      ).resolves.toMatchObject({
        ...httpToken,
        peer
      })

      const httpTokens = [
        {
          peerId: peer.id,
          token: uuid()
        },
        {
          peerId: peer.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toMatchObject({
        ...httpTokens[0],
        peer
      })
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toMatchObject({
        ...httpTokens[1],
        peer
      })
    })

    test('Cannot create token with unknown peer', async (): Promise<void> => {
      const httpToken = {
        peerId: uuid(),
        token: uuid()
      }
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.UnknownPeer
      )
    })

    test('Cannot create duplicate tokens', async (): Promise<void> => {
      const token = uuid()
      const httpTokens = [
        {
          peerId: peer.id,
          token
        },
        {
          peerId: peer.id,
          token
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
    })

    test('Cannot create duplicate token for same peer', async (): Promise<void> => {
      const httpToken = {
        peerId: peer.id,
        token: uuid()
      }
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
    })

    test('Cannot create duplicate token for different peer', async (): Promise<void> => {
      const token = uuid()
      await expect(
        httpTokenService.create([
          {
            peerId: peer.id,
            token
          }
        ])
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.create([
          {
            peerId: (await peerFactory.build()).id,
            token
          }
        ])
      ).resolves.toEqual(HttpTokenError.DuplicateToken)
    })
  })

  describe('Delete Tokens', (): void => {
    test('Tokens can be deleted by peer id', async (): Promise<void> => {
      const httpTokens = [
        {
          peerId: peer.id,
          token: uuid()
        },
        {
          peerId: peer.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toBeDefined()
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toBeDefined()
      await expect(
        httpTokenService.deleteByPeer(peer.id)
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toBeUndefined()
    })
  })
})
