import { faker } from '@faker-js/faker'
import jestOpenAPI from 'jest-openapi'

import { Amount, AmountJSON, parseAmount, serializeAmount } from '../../amount'
import { PaymentPointer } from '../../payment_pointer/model'
import { getRouteTests, setup } from '../../payment_pointer/model.test'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import {
  AppServices,
  CreateContext,
  CompleteContext,
  ListContext
} from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPayment } from './model'
import {
  IncomingPaymentRoutes,
  CreateBody,
  ReadContextWithAuthenticatedStatus
} from './routes'
import { createAsset } from '../../../tests/asset'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { Asset } from '../../../asset/model'
import { IncomingPaymentError, errorToCode, errorToMessage } from './errors'
import { IncomingPaymentService } from './service'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes
  let incomingPaymentService: IncomingPaymentService

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
  })

  let asset: Asset
  let paymentPointer: PaymentPointer
  let expiresAt: Date
  let incomingAmount: Amount
  let metadata: Record<string, unknown>

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')
    incomingPaymentService = await deps.use('incomingPaymentService')

    expiresAt = new Date(Date.now() + 30_000)
    asset = await createAsset(deps)
    paymentPointer = await createPaymentPointer(deps, {
      assetId: asset.id
    })
    incomingAmount = {
      value: BigInt('123'),
      assetScale: asset.scale,
      assetCode: asset.code
    }
    metadata = {
      description: 'hello world',
      externalRef: '#123'
    }
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/list', (): void => {
    getRouteTests({
      getPaymentPointer: async () => paymentPointer,
      createModel: async ({ client }) =>
        createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id,
          client,
          expiresAt,
          incomingAmount,
          metadata
        }),
      get: (ctx) =>
        incomingPaymentRoutes.get(ctx as ReadContextWithAuthenticatedStatus),
      getBody: (incomingPayment, list) => {
        return {
          id: incomingPayment.getUrl(paymentPointer),
          paymentPointer: paymentPointer.url,
          completed: false,
          incomingAmount:
            incomingPayment.incomingAmount &&
            serializeAmount(incomingPayment.incomingAmount),
          expiresAt: incomingPayment.expiresAt.toISOString(),
          createdAt: incomingPayment.createdAt.toISOString(),
          updatedAt: incomingPayment.updatedAt.toISOString(),
          receivedAmount: serializeAmount(incomingPayment.receivedAmount),
          metadata: incomingPayment.metadata,
          ilpStreamConnection: list
            ? `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`
            : {
                id: `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`,
                ilpAddress: expect.stringMatching(
                  /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
                ),
                sharedSecret: expect.stringMatching(/^[a-zA-Z0-9-_]{43}$/),
                assetCode: incomingPayment.receivedAmount.assetCode,
                assetScale: incomingPayment.receivedAmount.assetScale
              }
        }
      },
      list: (ctx) => incomingPaymentRoutes.list(ctx),
      urlPath: IncomingPayment.urlPath
    })

    test('returns 500 for unexpected error', async (): Promise<void> => {
      const incomingPaymentService = await deps.use('incomingPaymentService')
      jest
        .spyOn(incomingPaymentService, 'getPaymentPointerPage')
        .mockRejectedValueOnce(new Error('unexpected'))
      const ctx = setup<ListContext>({
        reqOpts: {
          headers: { Accept: 'application/json' }
        },
        paymentPointer
      })
      await expect(incomingPaymentRoutes.list(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Error trying to list incoming payments`
      })
    })
  })

  describe('create', (): void => {
    let amount: AmountJSON

    beforeEach((): void => {
      amount = {
        value: '2',
        assetCode: asset.code,
        assetScale: asset.scale
      }
    })

    test.each(Object.values(IncomingPaymentError))(
      'returns error on %s',
      async (error): Promise<void> => {
        const ctx = setup<CreateContext<CreateBody>>({
          reqOpts: { body: {} },
          paymentPointer
        })
        const createSpy = jest
          .spyOn(incomingPaymentService, 'create')
          .mockResolvedValueOnce(error)
        await expect(incomingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: errorToMessage[error],
          status: errorToCode[error]
        })
        expect(createSpy).toHaveBeenCalledWith({
          paymentPointerId: paymentPointer.id
        })
      }
    )

    test.each`
      client                                        | incomingAmount | expiresAt                                      | metadata
      ${faker.internet.url({ appendSlash: false })} | ${true}        | ${new Date(Date.now() + 30_000).toISOString()} | ${{ description: 'text', externalRef: '#123' }}
      ${undefined}                                  | ${false}       | ${undefined}                                   | ${undefined}
    `(
      'returns the incoming payment on success',
      async ({
        client,
        incomingAmount,
        metadata,
        expiresAt
      }): Promise<void> => {
        const ctx = setup<CreateContext<CreateBody>>({
          reqOpts: {
            body: {
              incomingAmount: incomingAmount ? amount : undefined,
              metadata,
              expiresAt
            },
            method: 'POST',
            url: `/incoming-payments`
          },
          paymentPointer,
          client
        })
        const incomingPaymentService = await deps.use('incomingPaymentService')
        const createSpy = jest.spyOn(incomingPaymentService, 'create')
        await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
        expect(createSpy).toHaveBeenCalledWith({
          paymentPointerId: paymentPointer.id,
          incomingAmount: incomingAmount ? parseAmount(amount) : undefined,
          metadata,
          expiresAt: expiresAt ? new Date(expiresAt) : undefined,
          client
        })
        expect(ctx.response).toSatisfyApiSpec()
        const incomingPaymentId = (
          (ctx.response.body as Record<string, unknown>)['id'] as string
        )
          .split('/')
          .pop()
        const connectionId = (
          (
            (ctx.response.body as Record<string, unknown>)[
              'ilpStreamConnection'
            ] as Record<string, unknown>
          )['id'] as string
        )
          .split('/')
          .pop()
        expect(ctx.response.body).toEqual({
          id: `${paymentPointer.url}/incoming-payments/${incomingPaymentId}`,
          paymentPointer: paymentPointer.url,
          incomingAmount: incomingAmount ? amount : undefined,
          expiresAt: expiresAt || expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          receivedAmount: {
            value: '0',
            assetCode: asset.code,
            assetScale: asset.scale
          },
          metadata,
          completed: false,
          ilpStreamConnection: {
            id: `${config.openPaymentsUrl}/connections/${connectionId}`,
            ilpAddress: expect.stringMatching(
              /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
            ),
            sharedSecret: expect.any(String),
            assetCode: asset.code,
            assetScale: asset.scale
          }
        })
      }
    )
  })

  describe('complete', (): void => {
    let incomingPayment: IncomingPayment
    beforeEach(async (): Promise<void> => {
      incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        expiresAt,
        incomingAmount,
        metadata
      })
    })
    test('returns 200 with an updated open payments incoming payment', async (): Promise<void> => {
      const ctx = setup<CompleteContext>({
        reqOpts: {
          headers: { Accept: 'application/json' },
          method: 'POST',
          url: `/incoming-payments/${incomingPayment.id}/complete`
        },
        params: {
          id: incomingPayment.id
        },
        paymentPointer
      })
      ctx.paymentPointer = paymentPointer
      await expect(incomingPaymentRoutes.complete(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        id: incomingPayment.getUrl(paymentPointer),
        paymentPointer: paymentPointer.url,
        incomingAmount: {
          value: '123',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: expiresAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: expect.any(String),
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        metadata,
        completed: true
      })
    })
  })
  describe('get unauthenticated incoming payment', (): void => {
    test('Can get incoming payment with public fields', async (): Promise<void> => {
      const incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        expiresAt,
        incomingAmount,
        metadata
      })

      const ctx = setup<ReadContextWithAuthenticatedStatus>({
        reqOpts: {
          headers: { Accept: 'application/json' },
          method: 'GET',
          url: `/incoming-payments/${incomingPayment.id}`
        },
        params: {
          id: incomingPayment.id
        },
        paymentPointer
      })
      ctx.authenticated = false

      await expect(incomingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()
      expect(ctx.body).toEqual({
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        }
      })
    })
  })
})
