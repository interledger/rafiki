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
import { Pagination } from '../shared/pagination'
import { randomAsset } from '../tests/asset'
import { truncateTables } from '../tests/tableManager'

describe('Peer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
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
    routing: {
      staticIlpAddress: 'test.' + uuid()
    }
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
    }
  )

  beforeEach(
    async (): Promise<void> => {
      peerService = await deps.use('peerService')
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
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      assert.ok(options.http)
      expect(peer.account).toMatchObject({
        ...options,
        http: {
          outgoing: options.http.outgoing
        }
      })
      const retrievedPeer = await peerService.get(peer.id)
      if (!retrievedPeer) throw new Error('peer not found')
      expect(retrievedPeer).toEqual(peer)
    })

    test('Creating a peer creates a peer account', async (): Promise<void> => {
      const accountService = await deps.use('accountService')
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      const peerAccount = await accountService.get(peer.accountId)

      expect(peerAccount).toEqual(peer.account)
    })

    test('Auto-creates corresponding asset', async (): Promise<void> => {
      const assetService = await deps.use('assetService')
      const options = randomPeer()

      await expect(assetService.get(options.asset)).resolves.toBeUndefined()

      await peerService.create(options)

      await expect(assetService.get(options.asset)).resolves.toBeDefined()
    })

    test('Cannot fetch a bogus peer', async (): Promise<void> => {
      expect(peerService.get(uuid())).resolves.toBeUndefined()
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
          routing: {
            staticIlpAddress: 'test.hello!'
          }
        })
      ).resolves.toEqual(PeerError.InvalidStaticIlpAddress)
    })
  })

  describe('Update Peer', (): void => {
    test('Can update a peer', async (): Promise<void> => {
      const peer = await peerService.create(randomPeer())
      assert.ok(!isPeerError(peer))
      const updateOptions: UpdateOptions = {
        id: peer.id,
        ...randomPeer()
      }

      const peerOrError = await peerService.update(updateOptions)
      assert.ok(!isPeerError(peerOrError))
      assert.ok(updateOptions.http)
      delete updateOptions.http.incoming
      const expectedPeer = {
        account: {
          ...updateOptions,
          id: peer.account.id,
          asset: peer.account.asset
        }
      }
      expect(peerOrError).toMatchObject(expectedPeer)
      await expect(peerService.get(peer.id)).resolves.toEqual(peerOrError)
    })

    test('Cannot update nonexistent peer', async (): Promise<void> => {
      const updateOptions: UpdateOptions = {
        id: uuid(),
        disabled: true
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.UnknownPeer
      )
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = Faker.datatype.string(32)
      {
        const options = randomPeer()
        assert.ok(options.http.incoming)
        options.http.incoming.authTokens.push(incomingToken)
        const peer = await peerService.create(options)
        assert.ok(!isPeerError(peer))
      }

      const peer = await peerService.create(randomPeer())
      assert.ok(!isPeerError(peer))
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          incoming: {
            authTokens: [incomingToken]
          },
          outgoing: peer.account.http.outgoing
        }
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })

    test('Returns error for duplicate incoming tokens', async (): Promise<void> => {
      const peer = await peerService.create(randomPeer())
      assert.ok(!isPeerError(peer))
      const incomingToken = Faker.datatype.string(32)
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken]
          },
          outgoing: peer.account.http.outgoing
        }
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })

    test('Returns error for invalid static ILP address', async (): Promise<void> => {
      const peer = await peerService.create(randomPeer())
      assert.ok(!isPeerError(peer))
      const updateOptions: UpdateOptions = {
        id: peer.id,
        routing: {
          staticIlpAddress: 'test.hello!'
        }
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.InvalidStaticIlpAddress
      )
      await expect(peerService.get(peer.id)).resolves.toEqual(peer)
    })
  })

  describe('Peer pagination', (): void => {
    let peersCreated: Peer[]

    beforeEach(
      async (): Promise<void> => {
        peersCreated = []
        const asset = randomAsset()
        for (let i = 0; i < 40; i++) {
          const peer = await peerService.create({
            ...randomPeer(),
            asset
          })
          assert.ok(!isPeerError(peer))
          peersCreated.push(peer)
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
