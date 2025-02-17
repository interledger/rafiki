import {
  getWalletAddressForSubresource,
  getWalletAddressUrlFromRequestBody,
  getWalletAddressUrlFromQueryParams,
  getWalletAddressUrlFromIncomingPayment,
  getWalletAddressUrlFromQuote,
  getWalletAddressUrlFromOutgoingPayment,
  getWalletAddressUrlFromPath
} from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import {
  AppServices,
  GetCollectionQuery,
  SignedCollectionContext,
  WalletAddressContext,
  WalletAddressUrlContext
} from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createContext } from '../../tests/context'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { WalletAddressService } from './service'
import assert from 'assert'
import { OpenPaymentsServerRouteError } from '../route-errors'
import { CreateBody as IncomingPaymentCreateBody } from '../payment/incoming/routes'
import { QuoteService } from '../quote/service'
import { IncomingPaymentService } from '../payment/incoming/service'
import { OutgoingPaymentService } from '../payment/outgoing/service'
import { Quote } from '../quote/model'
import { IncomingPayment } from '../payment/incoming/model'
import { OutgoingPayment } from '../payment/outgoing/model'
import { createOutgoingPayment } from '../../tests/outgoingPayment'
import { createAsset } from '../../tests/asset'
import { AssetOptions } from '../../asset/service'
import { createQuote } from '../../tests/quote'

describe('Wallet Address Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressService: WalletAddressService
  let incomingPaymentService: IncomingPaymentService
  let quoteService: QuoteService
  let outgoingPaymentService: OutgoingPaymentService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    walletAddressService = await deps.use('walletAddressService')
    incomingPaymentService = await deps.use('incomingPaymentService')
    quoteService = await deps.use('quoteService')
    outgoingPaymentService = await deps.use('outgoingPaymentService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getWalletAddressUrlFromRequestBody', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = 'https://example.com/test'
      const ctx: SignedCollectionContext<IncomingPaymentCreateBody> =
        createContext({
          headers: {
            Accept: 'application/json'
          },
          body: {
            walletAddress: walletAddressUrl
          }
        })

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromRequestBody(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('getWalletAddressUrlFromQueryParams', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = 'https://example.com/test'
      const ctx: SignedCollectionContext<never, GetCollectionQuery> =
        createContext({
          headers: {
            Accept: 'application/json'
          },
          query: {
            'wallet-address': walletAddressUrl
          }
        })

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromQueryParams(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('getWalletAddressUrlFromPath', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = new URL('https://example.com/test')

      const ctx: WalletAddressUrlContext = createContext({
        url: walletAddressUrl.href,
        headers: {
          Accept: 'application/json'
        }
      })

      ctx.request.headers.host = walletAddressUrl.host
      // Strip preceding forward slash
      ctx.params.walletAddressPath = walletAddressUrl.pathname.substring(1)

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromPath(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl.href)
      expect(next).toHaveBeenCalled()
    })
  })

  describe('getWalletAddressUrlFromIncomingPayment', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = 'https://example.com/test'
      const incomingPaymentId = crypto.randomUUID()

      jest.spyOn(incomingPaymentService, 'get').mockResolvedValueOnce({
        id: incomingPaymentId,
        walletAddress: {
          url: walletAddressUrl
        }
      } as IncomingPayment)

      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: incomingPaymentId
        }
      )
      ctx.container = deps

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromIncomingPayment(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl)
      expect(next).toHaveBeenCalled()
    })

    test('throws error if could not find incoming payment', async (): Promise<void> => {
      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: crypto.randomUUID()
        }
      )
      ctx.container = deps

      const next = jest.fn()

      expect.assertions(3)
      try {
        await getWalletAddressUrlFromIncomingPayment(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toBe('Unauthorized')
        expect(next).not.toHaveBeenCalled()
      }
    })
  })

  describe('getWalletAddressUrlFromQuote', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = 'https://example.com/test'
      const quoteId = crypto.randomUUID()

      jest.spyOn(quoteService, 'get').mockResolvedValueOnce({
        id: quoteId,
        walletAddress: {
          url: walletAddressUrl
        }
      } as Quote)

      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: quoteId
        }
      )
      ctx.container = deps

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromQuote(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl)
      expect(next).toHaveBeenCalled()
    })

    test('throws error if could not find existing quote for mismatched tenantId', async () => {
      const tenantId = Config.operatorTenantId

      const asset: AssetOptions = {
        scale: 9,
        code: 'USD'
      }
      const { id: sendAssetId } = await createAsset(deps, asset)
      const walletAddress = await createWalletAddress(deps, {
        tenantId,
        assetId: sendAssetId
      })

      const existingQuoteId = (
        await createOutgoingPayment(deps, {
          tenantId: Config.operatorTenantId,
          walletAddressId: walletAddress.id,
          method: 'ilp',
          receiver: `${
            Config.openPaymentsUrl
          }/${crypto.randomUUID()}/incoming-payments/${crypto.randomUUID()}`,
          debitAmount: {
            value: BigInt(456),
            assetCode: walletAddress.asset.code,
            assetScale: walletAddress.asset.scale
          },
          validDestination: false
        })
      ).quote.id

      const ctx: WalletAddressUrlContext = createContext(
        { headers: { Accept: 'application/json' } },
        {
          id: existingQuoteId,
          tenantId: crypto.randomUUID()
        }
      )

      ctx.container = deps
      const next = jest.fn()

      expect.assertions(3)
      try {
        await getWalletAddressUrlFromQuote(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toBe('Unauthorized')
        expect(next).not.toHaveBeenCalled()
      }
    })

    test('throws error if could not find quote', async (): Promise<void> => {
      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: crypto.randomUUID()
        }
      )

      jest.spyOn(quoteService, 'get').mockResolvedValueOnce(undefined)

      ctx.container = deps

      const next = jest.fn()

      expect.assertions(3)
      try {
        await getWalletAddressUrlFromIncomingPayment(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toBe('Unauthorized')
        expect(next).not.toHaveBeenCalled()
      }
    })
  })

  describe('getWalletAddressUrlFromOutgoingPayment', () => {
    test('sets walletAddressUrl', async (): Promise<void> => {
      const walletAddressUrl = 'https://example.com/test'
      const outgoingPaymentId = crypto.randomUUID()

      jest.spyOn(outgoingPaymentService, 'get').mockResolvedValueOnce({
        id: outgoingPaymentId,
        walletAddress: {
          url: walletAddressUrl
        }
      } as OutgoingPayment)

      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: outgoingPaymentId
        }
      )
      ctx.container = deps

      const next = jest.fn()

      await expect(
        getWalletAddressUrlFromOutgoingPayment(ctx, next)
      ).resolves.toBeUndefined()

      expect(ctx.walletAddressUrl).toBe(walletAddressUrl)
      expect(next).toHaveBeenCalled()
    })

    test('throws error if could not find existing outgoing payment for mismatched tenantId', async () => {
      const tenantId = Config.operatorTenantId

      const asset: AssetOptions = {
        scale: 9,
        code: 'USD'
      }
      const { id: sendAssetId } = await createAsset(deps, asset)
      const walletAddress = await createWalletAddress(deps, {
        tenantId,
        assetId: sendAssetId
      })

      const existingPaymentId = (
        await createOutgoingPayment(deps, {
          tenantId: Config.operatorTenantId,
          walletAddressId: walletAddress.id,
          method: 'ilp',
          receiver: `${
            Config.openPaymentsUrl
          }/${crypto.randomUUID()}/incoming-payments/${crypto.randomUUID()}`,
          debitAmount: {
            value: BigInt(456),
            assetCode: walletAddress.asset.code,
            assetScale: walletAddress.asset.scale
          },
          validDestination: false
        })
      ).id

      const ctx: WalletAddressUrlContext = createContext(
        { headers: { Accept: 'application/json' } },
        {
          id: existingPaymentId,
          tenantId: crypto.randomUUID()
        }
      )

      ctx.container = deps
      const next = jest.fn()

      expect.assertions(3)
      try {
        await getWalletAddressUrlFromOutgoingPayment(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toBe('Unauthorized')
        expect(next).not.toHaveBeenCalled()
      }
    })

    test('throws error if could not find outgoing payment', async (): Promise<void> => {
      const ctx: WalletAddressUrlContext = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {
          id: crypto.randomUUID()
        }
      )

      jest.spyOn(outgoingPaymentService, 'get').mockResolvedValueOnce(undefined)

      ctx.container = deps

      const next = jest.fn()

      expect.assertions(3)
      try {
        await getWalletAddressUrlFromOutgoingPayment(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(401)
        expect(err.message).toBe('Unauthorized')
        expect(next).not.toHaveBeenCalled()
      }
    })
  })

  describe('getWalletAddressForSubresource', () => {
    let ctx: WalletAddressContext
    let next: jest.MockedFunction<() => Promise<void>>

    beforeEach((): void => {
      ctx = createContext(
        {
          headers: {
            Accept: 'application/json'
          }
        },
        {}
      )

      ctx.container = deps
      next = jest.fn()
    })

    test('throws error for unknown wallet address', async (): Promise<void> => {
      jest
        .spyOn(walletAddressService, 'getOrPollByUrl')
        .mockResolvedValueOnce(undefined)

      expect.assertions(3)
      try {
        await getWalletAddressForSubresource(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe('Could not get wallet address')
        expect(next).not.toHaveBeenCalled()
      }
    })

    test('throws error for deactivated wallet address', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
      ctx.walletAddressUrl = walletAddress.url

      await walletAddress.$query().patch({ deactivatedAt: new Date() })

      expect.assertions(3)
      try {
        await getWalletAddressForSubresource(ctx, next)
      } catch (err) {
        assert(err instanceof OpenPaymentsServerRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe('Could not get wallet address')
        expect(next).not.toHaveBeenCalled()
      }
    })

    test('sets walletAddress on context and calls next', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })
      ctx.walletAddressUrl = walletAddress.url

      await expect(
        getWalletAddressForSubresource(ctx, next)
      ).resolves.toBeUndefined()
      expect(next).toHaveBeenCalled()
      expect(ctx.walletAddress).toEqual(walletAddress)
    })
  })
})
