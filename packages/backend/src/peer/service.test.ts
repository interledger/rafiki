import assert from 'assert'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { isPeerError, PeerError } from './errors'
import { CreateOptions, PeerService, UpdateOptions } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Asset } from '../asset/model'
import { Pagination } from '../shared/baseModel'
import { getPageTests } from '../shared/baseModel.test'
import { createAsset } from '../tests/asset'
import { createPeer } from '../tests/peer'
import { truncateTables } from '../tests/tableManager'

describe('Peer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let peerService: PeerService
  let knex: Knex
  let asset: Asset

  const randomPeer = (): CreateOptions => ({
    assetId: asset.id,
    http: {
      incoming: {
        authTokens: [faker.datatype.string(32)]
      },
      outgoing: {
        authToken: faker.datatype.string(32),
        endpoint: faker.internet.url()
      }
    },
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid(),
    name: faker.name.fullName()
  })

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    peerService = await deps.use('peerService')
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create/Get Peer', (): void => {
    test('A peer can be created and fetched', async (): Promise<void> => {
      const options = {
        assetId: asset.id,
        http: {
          outgoing: {
            authToken: faker.datatype.string(32),
            endpoint: faker.internet.url()
          }
        },
        staticIlpAddress: 'test.' + uuid(),
        name: faker.name.fullName()
      }
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      expect(peer).toMatchObject({
        asset,
        http: {
          outgoing: options.http.outgoing
        },
        staticIlpAddress: options.staticIlpAddress,
        name: options.name
      })
      const retrievedPeer = await peerService.get(peer.id)
      if (!retrievedPeer) throw new Error('peer not found')
      expect(retrievedPeer).toEqual(peer)
    })

    test('A peer can be created with all settings', async (): Promise<void> => {
      const options = randomPeer()
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      expect(peer).toMatchObject({
        asset,
        http: {
          outgoing: options.http.outgoing
        },
        maxPacketAmount: options.maxPacketAmount,
        staticIlpAddress: options.staticIlpAddress,
        name: options.name
      })
      const retrievedPeer = await peerService.get(peer.id)
      if (!retrievedPeer) throw new Error('peer not found')
      expect(retrievedPeer).toEqual(peer)
    })

    test('Creating a peer creates a liquidity account', async (): Promise<void> => {
      const options = randomPeer()
      const accountingService = await deps.use('accountingService')
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))
      await expect(accountingService.getBalance(peer.id)).resolves.toEqual(
        BigInt(0)
      )
    })

    test('Cannot fetch a bogus peer', async (): Promise<void> => {
      await expect(peerService.get(uuid())).resolves.toBeUndefined()
    })

    test('Cannot create a peer with unknown asset', async (): Promise<void> => {
      const options = randomPeer()
      await expect(
        peerService.create({
          ...options,
          assetId: uuid()
        })
      ).resolves.toEqual(PeerError.UnknownAsset)
    })

    test('Cannot create a peer with duplicate incoming tokens', async (): Promise<void> => {
      const incomingToken = faker.datatype.string(32)

      const options = randomPeer()
      assert.ok(options.http.incoming)
      options.http.incoming.authTokens.push(incomingToken, incomingToken)
      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
    })

    test('Cannot create a peer with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = faker.datatype.string(32)

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
      const peer = await createPeer(deps)
      const { http, maxPacketAmount, staticIlpAddress, name } = randomPeer()
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http,
        maxPacketAmount,
        staticIlpAddress,
        name
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
        staticIlpAddress: updateOptions.staticIlpAddress,
        name: updateOptions.name
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
      const incomingToken = faker.datatype.string(32)
      await createPeer(deps, {
        http: {
          incoming: {
            authTokens: [incomingToken]
          }
        }
      })

      const peer = await createPeer(deps)
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
      const peer = await createPeer(deps)
      const incomingToken = faker.datatype.string(32)
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
      const peer = await createPeer(deps)
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
      const peer = await createPeer(deps)
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
      await createPeer(deps, {
        staticIlpAddress: 'test.rafiki_with_wildcards'
      })
      await expect(
        peerService.getByDestinationAddress('test.rafiki-with-wildcards')
      ).resolves.toBeUndefined()
    })
  })

  describe('Get Peer by Incoming Token', (): void => {
    test('Can retrieve peer by incoming token', async (): Promise<void> => {
      const incomingToken = faker.datatype.string(32)
      const peer = await createPeer(deps, {
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
      await createPeer(deps)

      await expect(
        peerService.getByIncomingToken(uuid())
      ).resolves.toBeUndefined()
    })
  })

  describe('Peer pagination', (): void => {
    getPageTests({
      createModel: () => createPeer(deps, { assetId: asset.id }),
      getPage: (pagination: Pagination | undefined) =>
        peerService.getPage(pagination)
    })
  })
})
