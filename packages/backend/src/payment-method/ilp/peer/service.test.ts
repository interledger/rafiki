import assert from 'assert'
import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

import { isPeerError, PeerError } from './errors'
import { CreateOptions, PeerService, UpdateOptions } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { Asset } from '../../../asset/model'
import { Pagination, SortOrder } from '../../../shared/baseModel'
import { getPageTests } from '../../../shared/baseModel.test'
import { createAsset } from '../../../tests/asset'
import { createPeer } from '../../../tests/peer'
import { truncateTables } from '../../../tests/tableManager'
import { AccountingService } from '../../../accounting/service'
import { TransferError } from '../../../accounting/errors'

describe('Peer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let peerService: PeerService
  let accountingService: AccountingService
  let asset: Asset
  let tenantId: string

  const randomPeer = (override?: Partial<CreateOptions>): CreateOptions => ({
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
    liquidityThreshold: BigInt(10000),
    tenantId: Config.operatorTenantId,
    ...override
  })

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    peerService = await deps.use('peerService')
    accountingService = await deps.use('accountingService')
    tenantId = Config.operatorTenantId
  })

  beforeEach(async (): Promise<void> => {
    asset = await createAsset(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create/Get Peer', (): void => {
    test.each`
      liquidityThreshold
      ${undefined}
      ${BigInt(1000)}
    `(
      'A peer can be created and fetched, liquidityThreshold: $liquidityThreshold',
      async ({ liquidityThreshold }): Promise<void> => {
        const options = {
          assetId: asset.id,
          http: {
            outgoing: {
              authToken: faker.string.sample(32),
              endpoint: faker.internet.url({ appendSlash: false })
            }
          },
          staticIlpAddress: 'test.' + uuid(),
          name: faker.person.fullName(),
          liquidityThreshold
        }
        const peer = await peerService.create(options)
        assert.ok(!isPeerError(peer))
        expect(peer).toMatchObject({
          asset,
          http: {
            outgoing: options.http.outgoing
          },
          staticIlpAddress: options.staticIlpAddress,
          name: options.name,
          liquidityThreshold: liquidityThreshold || null
        })
        const retrievedPeer = await peerService.get(peer.id, peer.tenantId)
        if (!retrievedPeer) throw new Error('peer not found')
        expect(retrievedPeer).toEqual(peer)
      }
    )

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
      const retrievedPeer = await peerService.get(peer.id, peer.tenantId)
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

    test('Can create peer with an initial amount of liquidity', async (): Promise<void> => {
      const initialLiquidity = 100n
      const options = randomPeer({ initialLiquidity })
      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))

      await expect(accountingService.getBalance(peer.id)).resolves.toBe(
        initialLiquidity
      )
    })

    test('Cannot create peer with invalid initial liquidity', async (): Promise<void> => {
      const initialLiquidity = -100n
      const options = randomPeer({ initialLiquidity })

      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.InvalidInitialLiquidity
      )
    })

    test('Cannot fetch a bogus peer', async (): Promise<void> => {
      await expect(peerService.get(uuid(), tenantId)).resolves.toBeUndefined()
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

    test('Cannot fetch a peer with incorrect tenantId', async (): Promise<void> => {
      const peer = await createPeer(deps)
      await expect(peerService.get(peer.id, uuid())).resolves.toBeUndefined()
    })

    test('Cannot create a peer with duplicate incoming tokens', async (): Promise<void> => {
      const incomingToken = faker.string.sample(32)

      const options = randomPeer()
      assert.ok(options.http.incoming)
      options.http.incoming.authTokens.push(incomingToken, incomingToken)
      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
    })

    test('Cannot create a peer with duplicate incoming token', async (): Promise<void> => {
      const incomingToken = faker.string.sample(32)

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

    test('Cannot create a peer with invalid HTTP endpoint', async (): Promise<void> => {
      const options = randomPeer()
      options.http.outgoing.endpoint = 'http://.com'
      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.InvalidHTTPEndpoint
      )
    })

    test('Cannot create a peer with duplicate ILP address and asset', async (): Promise<void> => {
      const options = randomPeer()

      const peer = await peerService.create(options)
      assert.ok(!isPeerError(peer))

      await expect(peerService.create(options)).resolves.toEqual(
        PeerError.DuplicatePeer
      )
    })

    test('Cannot create a peer with incorrect tenantId', async (): Promise<void> => {
      const options = randomPeer()
      await expect(
        peerService.create({ ...options, tenantId: uuid() })
      ).resolves.toEqual(PeerError.UnknownAsset)
    })
  })

  describe('Update Peer', (): void => {
    test.each`
      liquidityThreshold
      ${null}
      ${BigInt(2000)}
    `(
      'Can update a peer, liquidityThreshold: $liquidityThreshold',
      async ({ liquidityThreshold }): Promise<void> => {
        const peer = await createPeer(deps)
        const { http, maxPacketAmount, staticIlpAddress, name } = randomPeer()
        const updateOptions: UpdateOptions = {
          id: peer.id,
          http,
          maxPacketAmount,
          staticIlpAddress,
          name,
          liquidityThreshold,
          tenantId: peer.tenantId
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
          name: updateOptions.name,
          liquidityThreshold: updateOptions.liquidityThreshold || null
        }
        expect(peerOrError).toMatchObject(expectedPeer)
        await expect(peerService.get(peer.id, peer.tenantId)).resolves.toEqual(
          peerOrError
        )
      }
    )

    test('Cannot update nonexistent peer', async (): Promise<void> => {
      const updateOptions: UpdateOptions = {
        id: uuid(),
        maxPacketAmount: BigInt(2),
        tenantId: Config.operatorTenantId
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.UnknownPeer
      )
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const incomingToken = faker.string.sample(32)
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
        },
        tenantId: peer.tenantId
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
    })

    test('Returns error for duplicate incoming tokens', async (): Promise<void> => {
      const peer = await createPeer(deps)
      const incomingToken = faker.string.sample(32)
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          incoming: {
            authTokens: [incomingToken, incomingToken]
          },
          outgoing: peer.http.outgoing
        },
        tenantId: peer.tenantId
      }

      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.DuplicateIncomingToken
      )
      await expect(peerService.get(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
    })

    test('Returns error for invalid static ILP address', async (): Promise<void> => {
      const peer = await createPeer(deps)
      const updateOptions: UpdateOptions = {
        id: peer.id,
        staticIlpAddress: 'test.hello!',
        tenantId: peer.tenantId
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.InvalidStaticIlpAddress
      )
      await expect(peerService.get(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
    })

    test('Returns error for invalid HTTP endpoint', async (): Promise<void> => {
      const peer = await createPeer(deps)
      const updateOptions: UpdateOptions = {
        id: peer.id,
        http: {
          outgoing: {
            ...peer.http.outgoing,
            endpoint: 'http://.com'
          }
        },
        tenantId: peer.tenantId
      }
      await expect(peerService.update(updateOptions)).resolves.toEqual(
        PeerError.InvalidHTTPEndpoint
      )
      await expect(peerService.get(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
    })
  })

  describe('Get Peer By ILP Address', (): void => {
    test('Can retrieve peer by ILP address', async (): Promise<void> => {
      const peer = await createPeer(deps)
      await expect(
        peerService.getByDestinationAddress(peer.staticIlpAddress, tenantId)
      ).resolves.toEqual(peer)

      await expect(
        peerService.getByDestinationAddress(
          peer.staticIlpAddress + '.suffix',
          tenantId
        )
      ).resolves.toEqual(peer)

      await expect(
        peerService.getByDestinationAddress(
          peer.staticIlpAddress + 'suffix',
          tenantId
        )
      ).resolves.toBeUndefined()
    })

    test('Returns undefined if no account exists with address', async (): Promise<void> => {
      await expect(
        peerService.getByDestinationAddress('test.nope', tenantId)
      ).resolves.toBeUndefined()
    })

    test('Properly escapes Postgres pattern "_" wildcards in the static address', async (): Promise<void> => {
      await createPeer(deps, {
        staticIlpAddress: 'test.rafiki_with_wildcards'
      })
      await expect(
        peerService.getByDestinationAddress(
          'test.rafiki-with-wildcards',
          tenantId
        )
      ).resolves.toBeUndefined()
    })

    test('returns peer by ILP address and asset', async (): Promise<void> => {
      const staticIlpAddress = 'test.rafiki'

      const peer = await createPeer(deps, {
        staticIlpAddress,
        assetId: asset.id
      })

      const secondAsset = await createAsset(deps)
      const peerWithSecondAsset = await createPeer(deps, {
        staticIlpAddress,
        assetId: secondAsset.id
      })

      await expect(
        peerService.getByDestinationAddress('test.rafiki', tenantId, asset.id)
      ).resolves.toEqual(peer)
      await expect(
        peerService.getByDestinationAddress(
          'test.rafiki',
          tenantId,
          secondAsset.id
        )
      ).resolves.toEqual(peerWithSecondAsset)
    })

    test('returns peer with longest prefix match for ILP address', async (): Promise<void> => {
      const peer = await createPeer(deps, {
        staticIlpAddress: 'test.rafiki',
        assetId: asset.id
      })

      const peerWithLongerPrefixMatch = await createPeer(deps, {
        staticIlpAddress: 'test.rafiki.account'
      })

      await expect(
        peerService.getByDestinationAddress(
          'test.rafiki.account.12345',
          peer.tenantId
        )
      ).resolves.toEqual(peerWithLongerPrefixMatch)
    })
  })

  describe('Get Peer by Incoming Token', (): void => {
    test('Can retrieve peer by incoming token', async (): Promise<void> => {
      const incomingToken = faker.string.sample(32)
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
      getPage: (
        pagination?: Pagination,
        sortOrder?: SortOrder,
        tenantId?: string
      ) => peerService.getPage(pagination, sortOrder, tenantId)
    })
  })

  describe('Delete Peer', (): void => {
    test('Can delete peer', async (): Promise<void> => {
      const peer = await createPeer(deps)

      await expect(peerService.delete(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
    })

    test('Returns undefined if no peer exists by id', async (): Promise<void> => {
      await expect(
        peerService.delete(uuid(), tenantId)
      ).resolves.toBeUndefined()
    })

    test('Returns undefined for already deleted peer', async (): Promise<void> => {
      const peer = await createPeer(deps)

      await expect(peerService.delete(peer.id, peer.tenantId)).resolves.toEqual(
        peer
      )
      await expect(
        peerService.delete(peer.id, peer.tenantId)
      ).resolves.toBeUndefined()
    })
  })

  describe('Deposit Liquidity', (): void => {
    test('Can deposit liquidity to peer', async (): Promise<void> => {
      const peer = await createPeer(deps)

      const liquidity = 100n

      await expect(
        peerService.depositLiquidity({
          peerId: peer.id,
          amount: liquidity,
          tenantId: peer.tenantId
        })
      ).resolves.toBeUndefined()

      await expect(accountingService.getBalance(peer.id)).resolves.toBe(
        liquidity
      )
    })

    test('Returns error if transfer error', async (): Promise<void> => {
      const peer = await createPeer(deps)

      await expect(
        peerService.depositLiquidity({
          peerId: peer.id,
          amount: 100n,
          transferId: '',
          tenantId: peer.tenantId
        })
      ).resolves.toBe(TransferError.InvalidId)

      await expect(accountingService.getBalance(peer.id)).resolves.toBe(0n)
    })

    test('Returns error if cannot find peer', async (): Promise<void> => {
      await expect(
        peerService.depositLiquidity({
          peerId: uuid(),
          amount: 100n,
          tenantId
        })
      ).resolves.toBe(PeerError.UnknownPeer)
    })
  })
})
