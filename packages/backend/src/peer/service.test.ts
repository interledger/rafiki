import assert from 'assert'
import Faker from 'faker'
import Knex from 'knex'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { v4 as uuid } from 'uuid'

import { isPeerError, PeerError } from './errors'
import { Peer } from './model'
import { CreateOptions, PeerService, UpdateOptions } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { resetGraphileDb } from '../tests/graphileDb'
import { GraphileProducer } from '../messaging/graphileProducer'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Pagination } from '../shared/baseModel'
import { randomAsset } from '../tests/asset'
import { PeerFactory } from '../tests/peerFactory'
import { truncateTables } from '../tests/tableManager'

describe('Peer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let peerFactory: PeerFactory
  let peerService: PeerService
  let knex: Knex
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }

  const randomPeer = (): CreateOptions => ({
    asset: randomAsset(),
    http: {
      incoming: {
        authTokens: [Faker.datatype.string(32)]
      },
      outgoing: {
        authToken: Faker.datatype.string(32),
        endpoint: Faker.internet.url()
      }
    },
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid()
  })

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      peerService = await deps.use('peerService')
      peerFactory = new PeerFactory(peerService)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create/Get Peer', (): void => {
    const options = randomPeer()

    test('A peer can be created and fetched', async (): Promise<void> => {
      const options = {
        asset: randomAsset(),
        http: {
          outgoing: {
            authToken: Faker.datatype.string(32),
            endpoint: Faker.internet.url()
          }
        },
        staticIlpAddress: 'test.' + uuid()
      }
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      expect(peer).toMatchObject({
        asset: {
          code: options.asset.code,
          scale: options.asset.scale
        },
        http: {
          outgoing: options.http.outgoing
        },
        staticIlpAddress: options.staticIlpAddress
      })
      const retrievedPeer = await peerService.get(peer.id)
      if (!retrievedPeer) throw new Error('peer not found')
      expect(retrievedPeer).toEqual(peer)
    })

    test('A peer can be created with all settings', async (): Promise<void> => {
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      expect(peer).toMatchObject({
        asset: {
          code: options.asset.code,
          scale: options.asset.scale
        },
        http: {
          outgoing: options.http.outgoing
        },
        maxPacketAmount: options.maxPacketAmount,
        staticIlpAddress: options.staticIlpAddress
      })
      const retrievedPeer = await peerService.get(peer.id)
      if (!retrievedPeer) throw new Error('peer not found')
      expect(retrievedPeer).toEqual(peer)
    })

    test('Creating a peer creates a liquidity account', async (): Promise<void> => {
      const accountingService = await deps.use('accountingService')
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      await expect(accountingService.getBalance(peer.id)).resolves.toEqual(
        BigInt(0)
      )
    })

    test('Auto-creates corresponding asset', async (): Promise<void> => {
      const assetService = await deps.use('assetService')
      const options = randomPeer()

      await expect(assetService.get(options.asset)).resolves.toBeUndefined()

      await peerService.create(options)

      await expect(assetService.get(options.asset)).resolves.toBeDefined()
    })

    test('Cannot fetch a bogus peer', async (): Promise<void> => {
      await expect(peerService.get(uuid())).resolves.toBeUndefined()
    })

    test('Cannot create a peer with duplicate incoming tokens', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)

      const options = randomPeer()
      assert.ok(options.http.incoming)
      options.http.incoming.authTokens.push(incomingToken, incomingToken)
      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
    })

    test('Cannot create a peer with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)

      {
        const options = randomPeer()
        assert.ok(options.http.incoming)
        options.http.incoming.authTokens.push(incomingToken)
        await peerService.create(options)
      }
      {
        const options = randomPeer()
        assert.ok(options.http.incoming)
        options.http.incoming.authTokens.push(incomingToken)
        await expect(peerService.create(options)).resolves.toEqual(
          PeerError.DuplicateIncomingToken
        )
      }
    })

    test('Cannot create a peer with invalid static ILP address', async (): Promise<void> => {
      const options = randomPeer()
      await expect(
        peerService.create({
          ...options,
          staticIlpAddress: 'test.hello!'
        })
      ).resolves.toEqual(PeerError.InvalidStaticIlpAddress)
    })
  })

  describe('Update Peer', (): void => {
    test('Can update a peer', async (): Promise<void> => {
      const peer = await peerFactory.build()
      const { http, maxPacketAmount, staticIlpAddress } = randomPeer()
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http,
        maxPacketAmount,
        staticIlpAddress
      }

      const peerOrError = await peerService.update(updateOptions)
      assert.ok(!isPeerError(peerOrError))
      assert.ok(updateOptions.http)
      delete updateOptions.http.incoming
      const expectedPeer = {
        asset: peer.asset,
        http: {
          outgoing: updateOptions.http.outgoing
        },
        maxPacketAmount: updateOptions.maxPacketAmount,
        staticIlpAddress: updateOptions.staticIlpAddress
      }
      expect(peerOrError).toMatchObject(expectedPeer)
      await expect(peerService.get(peer.id)).resolves.toEqual(peerOrError)
    })

    test('Cannot update nonexistent peer', async (): Promise<void> => {
      const updateOptions: UpdateOptions = {
        id: uuid(),
        maxPacketAmount: BigInt(2)
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.UnknownPeer
      )
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)
      await peerFactory.build({
        http: {
          incoming: {
            authTokens: [incomingToken]
          }
        }
      })

      const peer = await peerFactory.build()
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          incoming: {
            authTokens: [incomingToken]
          },
          outgoing: peer.http.outgoing
        }
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })

    test('Returns error for duplicate incoming tokens', async (): Promise<void> => {
      const peer = await peerFactory.build()
      const incomingToken = Faker.datatype.string(32)
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken]
          },
          outgoing: peer.http.outgoing
        }
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })

    test('Returns error for invalid static ILP address', async (): Promise<void> => {
      const peer = await peerFactory.build()
      const updateOptions: UpdateOptions = {
        id: peer.id,
        staticIlpAddress: 'test.hello!'
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.InvalidStaticIlpAddress
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })
  })

  describe('Get Peer By ILP Address', (): void => {
    test('Can retrieve peer by ILP address', async (): Promise<void> => {
      const peer = await peerFactory.build()
      await expect(
        peerService.getByDestinationAddress(peer.staticIlpAddress)
      ).resolves.toEqual(peer)

      await expect(
        peerService.getByDestinationAddress(peer.staticIlpAddress + '.suffix')
      ).resolves.toEqual(peer)

      await expect(
        peerService.getByDestinationAddress(peer.staticIlpAddress + 'suffix')
      ).resolves.toBeUndefined()
    })

    test('Returns undefined if no account exists with address', async (): Promise<void> => {
      await expect(
        peerService.getByDestinationAddress('test.nope')
      ).resolves.toBeUndefined()
    })

    test('Properly escapes Postgres pattern "_" wildcards in the static address', async (): Promise<void> => {
      await peerFactory.build({
        staticIlpAddress: 'test.rafiki_with_wildcards'
      })
      await expect(
        peerService.getByDestinationAddress('test.rafiki-with-wildcards')
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Peer by Incoming Token', (): void => {
    test('Can retrieve peer by incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)
      const peer = await peerFactory.build({
        http: {
          incoming: {
            authTokens: [incomingToken]
          }
        }
      })

      await expect(
        peerService.getByIncomingToken(incomingToken)
      ).resolves.toEqual(peer)
    })

    test('Returns undefined if no peer exists with token', async (): Promise<void> => {
      await peerFactory.build()

      await expect(
        peerService.getByIncomingToken(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Peer pagination', (): void => {
    let peersCreated: Peer[]

    beforeEach(
      async (): Promise<void> => {
        peersCreated = []
        const asset = randomAsset()
        for (let i = 0; i < 40; i++) {
          peersCreated.push(await peerFactory.build({ asset }))
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const peers = await peerService.getPage()
      expect(peers).toHaveLength(20)
      expect(peers[0].id).toEqual(peersCreated[0].id)
      expect(peers[19].id).toEqual(peersCreated[19].id)
      expect(peers[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(10)
      expect(peers[0].id).toEqual(peersCreated[0].id)
      expect(peers[9].id).toEqual(peersCreated[9].id)
      expect(peers[10]).toBeUndefined()
    }, 10_000)

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        after: peersCreated[19].id
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(20)
      expect(peers[0].id).toEqual(peersCreated[20].id)
      expect(peers[19].id).toEqual(peersCreated[39].id)
      expect(peers[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        first: 10,
        after: peersCreated[9].id
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(10)
      expect(peers[0].id).toEqual(peersCreated[10].id)
      expect(peers[9].id).toEqual(peersCreated[19].id)
      expect(peers[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination: Pagination = {
        last: 10
      }
      const peers = peerService.getPage(pagination)
      await expect(peers).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination: Pagination = {
        before: peersCreated[20].id
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(20)
      expect(peers[0].id).toEqual(peersCreated[0].id)
      expect(peers[19].id).toEqual(peersCreated[19].id)
      expect(peers[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination: Pagination = {
        last: 5,
        before: peersCreated[10].id
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(5)
      expect(peers[0].id).toEqual(peersCreated[5].id)
      expect(peers[4].id).toEqual(peersCreated[9].id)
      expect(peers[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const peersForwards = await peerService.getPage(paginationForwards)
      const paginationBackwards = {
        last: 10,
        before: peersCreated[10].id
      }
      const peersBackwards = await peerService.getPage(paginationBackwards)
      expect(peersForwards).toHaveLength(10)
      expect(peersBackwards).toHaveLength(10)
      expect(peersForwards).toEqual(peersBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination: Pagination = {
        after: peersCreated[19].id,
        before: peersCreated[19].id
      }
      const peers = await peerService.getPage(pagination)
      expect(peers).toHaveLength(20)
      expect(peers[0].id).toEqual(peersCreated[20].id)
      expect(peers[19].id).toEqual(peersCreated[39].id)
      expect(peers[20]).toBeUndefined()
    })

    test("Can't request less than 0 peers", async (): Promise<void> => {
      const pagination: Pagination = {
        first: -1
      }
      const peers = peerService.getPage(pagination)
      await expect(peers).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 peers", async (): Promise<void> => {
      const pagination: Pagination = {
        first: 101
      }
      const peers = peerService.getPage(pagination)
      await expect(peers).rejects.toThrow('Pagination index error')
    })
  })
})
