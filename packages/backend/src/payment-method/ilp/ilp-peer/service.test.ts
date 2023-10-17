import assert from 'assert'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createPeer } from '../../../tests/peer'
import { truncateTables } from '../../../tests/tableManager'
import { CreateArgs, IlpPeerService, UpdateArgs } from './service'
import { Peer } from '../peer/model'
import { IlpPeerError, isIlpPeerError } from './errors'
import { createAsset } from '../../../tests/asset'

describe('Ilp Peer Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ilpPeerService: IlpPeerService
  let peer: Peer

  const randomIlpPeer = (override?: Partial<CreateArgs>): CreateArgs => ({
    peerId: peer.id,
    maxPacketAmount: BigInt(100),
    staticIlpAddress: 'test.' + uuid(),
    ...override
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    ilpPeerService = await deps.use('ilpPeerService')
  })

  beforeEach(async (): Promise<void> => {
    peer = await createPeer(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create/Get Peer', (): void => {
    test('A peer can be created with all settings', async (): Promise<void> => {
      const args = randomIlpPeer()
      const ilpPeer = await ilpPeerService.create(args)

      assert.ok(!isIlpPeerError(ilpPeer))
      expect(ilpPeer).toMatchObject({
        peer,
        maxPacketAmount: args.maxPacketAmount,
        staticIlpAddress: args.staticIlpAddress
      })
      const retrievedPeer = await ilpPeerService.get(ilpPeer.id)
      expect(retrievedPeer).toEqual(ilpPeer)
    })

    test('Cannot create an ILP peer for unknown peer', async (): Promise<void> => {
      const args = randomIlpPeer()
      await expect(
        ilpPeerService.create({
          ...args,
          peerId: uuid()
        })
      ).resolves.toEqual(IlpPeerError.UnknownPeer)
    })

    test('Cannot create a peer with duplicate ILP address and peer', async (): Promise<void> => {
      const args = randomIlpPeer()
      const ilpPeer = await ilpPeerService.create(args)
      assert.ok(!isIlpPeerError(ilpPeer))

      await expect(ilpPeerService.create(args)).resolves.toEqual(
        IlpPeerError.DuplicateIlpPeer
      )
    })
  })

  describe('Update Peer', (): void => {
    test.each`
      staticIlpAddress    | maxPacketAmount | description
      ${undefined}        | ${1000n}        | ${'with just maxPacketAmount'}
      ${`test.${uuid()}`} | ${undefined}    | ${'with just staticIlpAddress'}
      ${`test.${uuid()}`} | ${1000n}        | ${'with maxPacketAmount and staticIlpAddress'}
    `(
      'Can update a peer $description',
      async ({ staticIlpAddress, maxPacketAmount }): Promise<void> => {
        const args = randomIlpPeer()
        const originalIlpPeer = await ilpPeerService.create(args)
        assert.ok(!isIlpPeerError(originalIlpPeer))

        const updateArgs: UpdateArgs = {
          id: originalIlpPeer.id,
          maxPacketAmount,
          staticIlpAddress
        }

        const expectedPeer = {
          peerId: args.peerId,
          maxPacketAmount:
            updateArgs.maxPacketAmount || originalIlpPeer.maxPacketAmount,
          staticIlpAddress:
            updateArgs.staticIlpAddress || originalIlpPeer.staticIlpAddress
        }
        await expect(ilpPeerService.update(updateArgs)).resolves.toMatchObject(
          expectedPeer
        )
        await expect(
          ilpPeerService.get(originalIlpPeer.id)
        ).resolves.toMatchObject(expectedPeer)
      }
    )

    test('Cannot update nonexistent peer', async (): Promise<void> => {
      const updateArgs: UpdateArgs = {
        id: uuid(),
        maxPacketAmount: BigInt(2)
      }

      await expect(ilpPeerService.update(updateArgs)).resolves.toEqual(
        IlpPeerError.UnknownPeer
      )
    })

    test('Returns error for invalid static ILP address', async (): Promise<void> => {
      const args = randomIlpPeer()
      const originalIlpPeer = await ilpPeerService.create(args)
      assert.ok(!isIlpPeerError(originalIlpPeer))

      const updateArgs: UpdateArgs = {
        id: originalIlpPeer.id,
        staticIlpAddress: 'test.hello!'
      }
      await expect(ilpPeerService.update(updateArgs)).resolves.toEqual(
        IlpPeerError.InvalidStaticIlpAddress
      )
      await expect(ilpPeerService.get(originalIlpPeer.id)).resolves.toEqual(
        originalIlpPeer
      )
    })
  })

  describe('Get Peer By ILP Address', (): void => {
    test('Can retrieve peer by ILP address', async (): Promise<void> => {
      const args = randomIlpPeer()
      const ilpPeer = await ilpPeerService.create(args)

      assert.ok(!isIlpPeerError(ilpPeer))
      await expect(
        ilpPeerService.getByDestinationAddress(ilpPeer.staticIlpAddress)
      ).resolves.toEqual(ilpPeer)

      await expect(
        ilpPeerService.getByDestinationAddress(
          ilpPeer.staticIlpAddress + '.suffix'
        )
      ).resolves.toEqual(ilpPeer)

      await expect(
        ilpPeerService.getByDestinationAddress(
          ilpPeer.staticIlpAddress + 'suffix'
        )
      ).resolves.toBeUndefined()
    })

    test('Returns undefined if no account exists with address', async (): Promise<void> => {
      await expect(
        ilpPeerService.getByDestinationAddress('test.nope')
      ).resolves.toBeUndefined()
    })

    test('Properly escapes Postgres pattern "_" wildcards in the static address', async (): Promise<void> => {
      const args = randomIlpPeer()

      await ilpPeerService.create({
        ...args,
        staticIlpAddress: 'test.rafiki_with_wildcards'
      })
      await expect(
        ilpPeerService.getByDestinationAddress('test.rafiki-with-wildcards')
      ).resolves.toBeUndefined()
    })

    test('returns peer by ILP address and asset', async (): Promise<void> => {
      const staticIlpAddress = 'test.rafiki'
      const args = randomIlpPeer({
        staticIlpAddress
      })

      const ilpPeer = await ilpPeerService.create(args)

      const secondAsset = await createAsset(deps)

      const ilpPeerWithSecondAsset = await ilpPeerService.create({
        staticIlpAddress,
        peerId: (await createPeer(deps, { assetId: secondAsset.id })).id
      })

      await expect(
        ilpPeerService.getByDestinationAddress('test.rafiki')
      ).resolves.toEqual(ilpPeer)
      await expect(
        ilpPeerService.getByDestinationAddress('test.rafiki', secondAsset.id)
      ).resolves.toEqual(ilpPeerWithSecondAsset)
    })
  })
})
