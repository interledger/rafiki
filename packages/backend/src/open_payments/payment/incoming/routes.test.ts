import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { Amount, serializeAmount } from '../../amount'
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
import { IncomingPaymentRoutes, CreateBody, MAX_EXPIRY } from './routes'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { AccessAction, AccessType, Grant } from '../../auth/grant'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
  })

  const asset = {
    code: 'USD',
    scale: 2
  }
  let paymentPointer: PaymentPointer
  let expiresAt: Date
  let incomingAmount: Amount
  let description: string
  let externalRef: string

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')

    expiresAt = new Date(Date.now() + 30_000)
    paymentPointer = await createPaymentPointer(deps, {
      asset
    })
    incomingAmount = {
      value: BigInt('123'),
      assetScale: asset.scale,
      assetCode: asset.code
    }
    description = 'hello world'
    externalRef = '#123'
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get/list', (): void => {
    getRouteTests({
      getPaymentPointer: async () => paymentPointer,
      createModel: async ({ clientId }) =>
        createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id,
          clientId,
          description,
          expiresAt,
          incomingAmount,
          externalRef
        }),
      get: (ctx) => incomingPaymentRoutes.get(ctx),
      getBody: (incomingPayment, list) => ({
        id: incomingPayment.url,
        paymentPointer: paymentPointer.url,
        completed: false,
        incomingAmount: serializeAmount(
          incomingPayment.incomingAmount as Amount
        ),
        description: incomingPayment.description,
        expiresAt: incomingPayment.expiresAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: incomingPayment.updatedAt.toISOString(),
        receivedAmount: serializeAmount(incomingPayment.receivedAmount),
        externalRef: '#123',
        ilpStreamConnection: list
          ? `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`
          : {
              id: `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`,
              ilpAddress: expect.stringMatching(
                /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
              ),
              sharedSecret: expect.stringMatching(/^[a-zA-Z0-9-_]{43}$/),
              assetCode: incomingPayment.incomingAmount?.assetCode,
              assetScale: incomingPayment.incomingAmount?.assetScale
            }
      }),
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

  describe.each`
    withGrant | description
    ${false}  | ${'without grant'}
    ${true}   | ${'with grant'}
  `('create - $description', ({ withGrant }): void => {
    test('returns error on distant-future expiresAt', async (): Promise<void> => {
      const ctx = setup<CreateContext<CreateBody>>({
        reqOpts: { body: {} },
        paymentPointer
      })
      ctx.request.body['expiresAt'] = new Date(
        Date.now() + MAX_EXPIRY + 1000
      ).toISOString()
      await expect(incomingPaymentRoutes.create(ctx)).rejects.toHaveProperty(
        'message',
        'expiry too high'
      )
    })

    test.each`
      incomingAmount                                     | description  | externalRef  | expiresAt
      ${{ value: '2', assetCode: 'USD', assetScale: 2 }} | ${'text'}    | ${'#123'}    | ${new Date(Date.now() + 30_000).toISOString()}
      ${undefined}                                       | ${undefined} | ${undefined} | ${undefined}
    `(
      'returns the incoming payment on success',
      async ({
        incomingAmount,
        description,
        externalRef,
        expiresAt
      }): Promise<void> => {
        const grant = withGrant
          ? new Grant({
              active: true,
              grant: uuid(),
              clientId: uuid(),
              access: [
                {
                  type: AccessType.IncomingPayment,
                  actions: [AccessAction.Create]
                }
              ]
            })
          : undefined
        const ctx = setup<CreateContext<CreateBody>>({
          reqOpts: {
            body: {
              incomingAmount,
              description,
              externalRef,
              expiresAt
            },
            method: 'POST',
            url: `/incoming-payments`
          },
          paymentPointer,
          grant
        })
        await expect(incomingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
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
          incomingAmount,
          description,
          expiresAt: expiresAt || expect.any(String),
          createdAt: expect.any(String),
          updatedAt: expect.any(String),
          receivedAmount: {
            value: '0',
            assetCode: asset.code,
            assetScale: asset.scale
          },
          externalRef,
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
        description,
        expiresAt,
        incomingAmount,
        externalRef
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
        id: incomingPayment.url,
        paymentPointer: paymentPointer.url,
        incomingAmount: {
          value: '123',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        description: incomingPayment.description,
        expiresAt: expiresAt.toISOString(),
        createdAt: incomingPayment.createdAt.toISOString(),
        updatedAt: expect.any(String),
        receivedAmount: {
          value: '0',
          assetCode: asset.code,
          assetScale: asset.scale
        },
        externalRef: '#123',
        completed: true
      })
    })
  })
})
