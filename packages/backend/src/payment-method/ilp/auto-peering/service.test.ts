import assert from 'assert'
import { IocContract } from '@adonisjs/fold'
import nock from 'nock'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { Config, IAppConfig } from '../../../config/app'
import { createTestApp, TestContainer } from '../../../tests/app'
import { createAsset } from '../../../tests/asset'
import { truncateTables } from '../../../tests/tableManager'
import { AutoPeeringError, isAutoPeeringError } from './errors'
import {
  AutoPeeringService,
  InitiatePeeringRequestArgs,
  PeeringDetails,
  PeeringRequestArgs
} from './service'
import { PeerService } from '../peer/service'
import { PeerError } from '../peer/errors'
import { v4 as uuid } from 'uuid'
import { AccountingService } from '../../../accounting/service'

describe('Auto Peering Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let autoPeeringService: AutoPeeringService
  let peerService: PeerService
  let accountingService: AccountingService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer({ ...Config, enableAutoPeering: true })
    appContainer = await createTestApp(deps)
    config = await deps.use('config')
    autoPeeringService = await deps.use('autoPeeringService')
    peerService = await deps.use('peerService')
    accountingService = await deps.use('accountingService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('acceptPeeringRequest', () => {
    test('creates peer and resolves stream credential details', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: PeeringRequestArgs = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken',
        name: 'Rafiki Money',
        maxPacketAmount: 1000
      }

      const peerCreateSpy = jest.spyOn(peerService, 'create')

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress,
        httpToken: expect.any(String),
        name: config.instanceName
      })
      expect(peerCreateSpy).toHaveBeenCalledWith({
        staticIlpAddress: args.staticIlpAddress,
        assetId: asset.id,
        maxPacketAmount: BigInt(args.maxPacketAmount!),
        name: args.name,
        initialLiquidity: BigInt(Number.MAX_SAFE_INTEGER),
        http: {
          incoming: { authTokens: [args.httpToken] },
          outgoing: {
            authToken: expect.any(String),
            endpoint: args.ilpConnectorAddress
          }
        }
      })
    })

    test('updates stream credentials details if duplicate peer request', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: PeeringRequestArgs = {
        staticIlpAddress: 'test.rafiki-money',
        ilpConnectorAddress: 'http://peer.rafiki.money',
        asset: { code: asset.code, scale: asset.scale },
        httpToken: 'someHttpToken',
        name: 'Rafiki Money'
      }

      const peerUpdateSpy = jest.spyOn(peerService, 'update')

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress,
        httpToken: expect.any(String),
        name: config.instanceName
      })
      expect(peerUpdateSpy).toHaveBeenCalledTimes(0)

      await expect(
        autoPeeringService.acceptPeeringRequest(args)
      ).resolves.toEqual({
        staticIlpAddress: config.ilpAddress,
        ilpConnectorAddress: config.ilpConnectorAddress,
        httpToken: expect.any(String),
        name: config.instanceName
      })
      expect(peerUpdateSpy).toHaveBeenCalledWith({
        id: expect.any(String),
        name: args.name,
        http: {
          incoming: { authTokens: [args.httpToken] },
          outgoing: {
            authToken: expect.any(String),
            endpoint: args.ilpConnectorAddress
          }
        }
      })
      expect(peerUpdateSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error if unknown asset', async (): Promise<void> => {
      const args: PeeringRequestArgs = {
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

      const args: PeeringRequestArgs = {
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

      const args: PeeringRequestArgs = {
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

      const args: PeeringRequestArgs = {
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

  describe('initiatePeeringRequest', () => {
    test('returns error if unknown asset', async (): Promise<void> => {
      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: uuid()
      }

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.UnknownAsset)
    })

    test('creates peer correctly', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        maxPacketAmount: 1000n,
        liquidityThreshold: 100n
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl)
        .post('/', (body) => {
          expect(body).toEqual({
            asset: {
              code: asset.code,
              scale: asset.scale
            },
            httpToken: expect.any(String),
            ilpConnectorAddress: config.ilpConnectorAddress,
            maxPacketAmount: Number(args.maxPacketAmount),
            name: config.instanceName,
            staticIlpAddress: config.ilpAddress
          })
          return body
        })
        .reply(200, peerDetails)

      const peerCreationSpy = jest.spyOn(peerService, 'create')

      const peer = await autoPeeringService.initiatePeeringRequest(args)

      assert(!isAutoPeeringError(peer))

      expect(peerCreationSpy).toHaveBeenCalledWith({
        assetId: asset.id,
        staticIlpAddress: peerDetails.staticIlpAddress,
        http: {
          incoming: {
            authTokens: [peerDetails.httpToken]
          },
          outgoing: {
            endpoint: peerDetails.ilpConnectorAddress,
            authToken: expect.any(String)
          }
        },
        maxPacketAmount: args.maxPacketAmount,
        name: peerDetails.name,
        liquidityThreshold: args.liquidityThreshold
      })

      scope.done()
    })

    test('adds liquidity during peer creation', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        maxPacketAmount: 1000n,
        liquidityThreshold: 100n,
        depositedLiquidity: 10000n
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl)
        .post('/', (body) => {
          expect(body).toEqual({
            asset: {
              code: asset.code,
              scale: asset.scale
            },
            httpToken: expect.any(String),
            ilpConnectorAddress: config.ilpConnectorAddress,
            maxPacketAmount: Number(args.maxPacketAmount),
            name: config.instanceName,
            staticIlpAddress: config.ilpAddress
          })
          return body
        })
        .reply(200, peerDetails)

      const peer = await autoPeeringService.initiatePeeringRequest(args)

      assert(!isAutoPeeringError(peer))

      await expect(accountingService.getBalance(peer.id)).resolves.toBe(
        args.depositedLiquidity
      )

      scope.done()
    })

    test('returns error if could not add liquidity during peer creation', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        maxPacketAmount: 1000n,
        liquidityThreshold: 100n,
        depositedLiquidity: -10000n
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl)
        .post('/', (body) => {
          expect(body).toEqual({
            asset: {
              code: asset.code,
              scale: asset.scale
            },
            httpToken: expect.any(String),
            ilpConnectorAddress: config.ilpConnectorAddress,
            maxPacketAmount: Number(args.maxPacketAmount),
            name: config.instanceName,
            staticIlpAddress: config.ilpAddress
          })
          return body
        })
        .reply(200, peerDetails)

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.LiquidityError)
      scope.done()
    })

    test('overrides peer default name if different name provided', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        maxPacketAmount: 1000n,
        name: 'Overridden Peer Name'
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').reply(200, peerDetails)

      const peerCreationSpy = jest.spyOn(peerService, 'create')

      const peer = await autoPeeringService.initiatePeeringRequest(args)

      assert(!isAutoPeeringError(peer))

      expect(peerCreationSpy).toHaveBeenCalledWith({
        assetId: asset.id,
        staticIlpAddress: peerDetails.staticIlpAddress,
        http: {
          incoming: {
            authTokens: [peerDetails.httpToken]
          },
          outgoing: {
            endpoint: peerDetails.ilpConnectorAddress,
            authToken: expect.any(String)
          }
        },
        maxPacketAmount: args.maxPacketAmount,
        name: args.name
      })

      scope.done()
    })

    test('returns error if invalid peer URL', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: `http://${uuid()}.test`,
        assetId: asset.id
      }

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidPeerUrl)
    })

    test('returns error if invalid ILP configuration', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const scope = nock(args.peerUrl)
        .post('/')
        .reply(400, {
          error: { type: AutoPeeringError.InvalidPeerIlpConfiguration }
        })

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidIlpConfiguration)
      scope.done()
    })

    test('returns error if peer does not support asset', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const scope = nock(args.peerUrl)
        .post('/')
        .reply(400, {
          error: { type: AutoPeeringError.UnknownAsset }
        })

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.PeerUnsupportedAsset)
      scope.done()
    })

    test('returns error if peer URL request error', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const scope = nock(args.peerUrl).post('/').replyWithError('some  error')

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidPeeringRequest)
      scope.done()
    })

    test('returns error if misconfigured ILP static address in peer response', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: '',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').reply(200, peerDetails)

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidPeerIlpConfiguration)
      scope.done()
    })

    test('returns error if misconfigured ILP connector address in peer response', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: '',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').reply(200, peerDetails)

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidPeerIlpConfiguration)
      scope.done()
    })

    test('updates peer if duplicate peer found', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: uuid(),
        name: 'Peer 2'
      }

      const secondPeerDetails: PeeringDetails = {
        ...peerDetails,
        httpToken: uuid()
      }

      const scope = nock(args.peerUrl)
        .post('/')
        .reply(200, peerDetails)
        .post('/')
        .reply(200, secondPeerDetails)

      const createdPeer = await autoPeeringService.initiatePeeringRequest(args)
      assert(!isAutoPeeringError(createdPeer))

      const newArgs: InitiatePeeringRequestArgs = {
        ...args,
        name: 'New Peer Name',
        maxPacketAmount: 1000n
      }

      const updatedPeer =
        await autoPeeringService.initiatePeeringRequest(newArgs)
      assert(!isAutoPeeringError(updatedPeer))

      expect(createdPeer.id).toBe(updatedPeer.id)
      expect(updatedPeer.name).toBe(newArgs.name)
      expect(updatedPeer.maxPacketAmount).toBe(newArgs.maxPacketAmount)

      const updatedIncomigHttpTokens = (
        await updatedPeer.$fetchGraph('incomingTokens')
      ).incomingTokens

      expect(updatedIncomigHttpTokens).toHaveLength(1)
      expect(updatedIncomigHttpTokens[0].token).toBe(
        secondPeerDetails.httpToken
      )

      scope.done()
    })

    test('adds liquidity on peer update', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        depositedLiquidity: 1000n
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: uuid(),
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').twice().reply(200, peerDetails)

      const createdPeer = await autoPeeringService.initiatePeeringRequest(args)
      assert(!isAutoPeeringError(createdPeer))

      const newArgs: InitiatePeeringRequestArgs = {
        ...args,
        depositedLiquidity: 2000n
      }

      const updatedPeer =
        await autoPeeringService.initiatePeeringRequest(newArgs)
      assert(!isAutoPeeringError(updatedPeer))

      expect(createdPeer.id).toBe(updatedPeer.id)

      await expect(accountingService.getBalance(createdPeer.id)).resolves.toBe(
        args.depositedLiquidity! + newArgs.depositedLiquidity!
      )
      scope.done()
    })

    test('returns error if could not add liquidity during peer update', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id,
        depositedLiquidity: 1000n
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: uuid(),
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').twice().reply(200, peerDetails)

      const createdPeer = await autoPeeringService.initiatePeeringRequest(args)
      assert(!isAutoPeeringError(createdPeer))

      const newArgs: InitiatePeeringRequestArgs = {
        ...args,
        depositedLiquidity: -2000n
      }

      await expect(
        autoPeeringService.initiatePeeringRequest(newArgs)
      ).resolves.toBe(AutoPeeringError.LiquidityError)

      scope.done()
    })

    test('returns error if other peer creation error', async (): Promise<void> => {
      const asset = await createAsset(deps)

      const args: InitiatePeeringRequestArgs = {
        peerUrl: 'http://peer.rafiki.money',
        assetId: asset.id
      }

      const peerDetails: PeeringDetails = {
        staticIlpAddress: 'test.peer2',
        ilpConnectorAddress: 'http://peer-two.com',
        httpToken: 'peerHttpToken',
        name: 'Peer 2'
      }

      const scope = nock(args.peerUrl).post('/').reply(200, peerDetails)

      jest
        .spyOn(peerService, 'create')
        .mockResolvedValueOnce(PeerError.DuplicateIncomingToken)

      await expect(
        autoPeeringService.initiatePeeringRequest(args)
      ).resolves.toBe(AutoPeeringError.InvalidPeeringRequest)
      scope.done()
    })
  })
})
