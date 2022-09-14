import jestOpenAPI from 'jest-openapi'
import * as httpMocks from 'node-mocks-http'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import {
  AppServices,
  ReadContext,
  CreateContext,
  ListContext
} from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { randomAsset } from '../../../tests/asset'
import { CreateOutgoingPaymentOptions } from './service'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { OutgoingPaymentRoutes, CreateBody } from './routes'
import { PaymentPointer } from '../../payment_pointer/model'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { listTests, setup } from '../../../shared/routes.test'
import { AccessAction, AccessType, Grant } from '../../auth/grant'
import { Grant as GrantModel } from '../../auth/grantModel'

describe('Outgoing Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let outgoingPaymentRoutes: OutgoingPaymentRoutes
  let paymentPointer: PaymentPointer
  let referenceGrant: GrantModel

  const receivingPaymentPointer = `https://wallet.example/${uuid()}`
  const asset = randomAsset()

  const createPayment = async (options: {
    paymentPointerId: string
    grant?: Grant | string
    description?: string
    externalRef?: string
  }): Promise<OutgoingPayment> => {
    return await createOutgoingPayment(deps, {
      ...options,
      receiver: `${receivingPaymentPointer}/incoming-payments/${uuid()}`,
      sendAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      validDestination: false
    })
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    config = await deps.use('config')
    outgoingPaymentRoutes = await deps.use('outgoingPaymentRoutes')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    paymentPointer = await createPaymentPointer(deps, { asset })
    referenceGrant = await GrantModel.query().insert({
      id: uuid(),
      clientId: uuid()
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    let grant: Grant
    beforeEach(async (): Promise<void> => {
      grant = new Grant({
        active: true,
        grant: referenceGrant.id,
        clientId: referenceGrant.clientId,
        access: [
          {
            type: AccessType.OutgoingPayment,
            actions: [AccessAction.Read]
          }
        ]
      })
    })
    describe.each`
      withGrant | description
      ${false}  | ${'without grant'}
      ${true}   | ${'with grant'}
    `('$description', ({ withGrant }): void => {
      test('returns 404 for nonexistent outgoing payment', async (): Promise<void> => {
        const ctx = setup<ReadContext>({
          reqOpts: {
            headers: { Accept: 'application/json' }
          },
          params: {
            outgoingPaymentId: uuid()
          },
          paymentPointer,
          grant: withGrant ? grant : undefined
        })
        await expect(outgoingPaymentRoutes.get(ctx)).rejects.toHaveProperty(
          'status',
          404
        )
      })

      test.each`
        failed   | description
        ${false} | ${''}
        ${true}  | ${'failed '}
      `(
        'returns the $description outgoing payment on success',
        async ({ failed }): Promise<void> => {
          const outgoingPayment = await createPayment({
            paymentPointerId: paymentPointer.id,
            grant: referenceGrant.id,
            description: 'rent',
            externalRef: '202201'
          })
          if (failed) {
            await outgoingPayment
              .$query(knex)
              .patch({ state: OutgoingPaymentState.Failed })
          }
          const ctx = setup<ReadContext>({
            reqOpts: {
              headers: { Accept: 'application/json' },
              method: 'GET',
              url: `/outgoing-payments/${outgoingPayment.id}`
            },
            params: {
              outgoingPaymentId: outgoingPayment.id
            },
            paymentPointer,
            grant: withGrant ? grant : undefined
          })
          await expect(outgoingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.body).toEqual({
            id: `${paymentPointer.url}/outgoing-payments/${outgoingPayment.id}`,
            paymentPointer: paymentPointer.url,
            receiver: outgoingPayment.receiver,
            sendAmount: {
              ...outgoingPayment.sendAmount,
              value: outgoingPayment.sendAmount.value.toString()
            },
            sentAmount: {
              value: '0',
              assetCode: asset.code,
              assetScale: asset.scale
            },
            receiveAmount: {
              ...outgoingPayment.receiveAmount,
              value: outgoingPayment.receiveAmount.value.toString()
            },
            description: outgoingPayment.description,
            externalRef: outgoingPayment.externalRef,
            failed,
            createdAt: outgoingPayment.createdAt.toISOString(),
            updatedAt: outgoingPayment.updatedAt.toISOString()
          })
        }
      )
    })
  })

  describe('create', (): void => {
    let options: Omit<CreateOutgoingPaymentOptions, 'paymentPointerId'>

    beforeEach(async (): Promise<void> => {
      options = {
        grant: referenceGrant.id,
        quoteId: `${paymentPointer.url}/quotes/${uuid()}`
      }
    })

    function setup(
      reqOpts: Pick<httpMocks.RequestOptions, 'headers'>
    ): CreateContext<CreateBody> {
      const ctx = createContext<CreateContext<CreateBody>>({
        headers: Object.assign(
          { Accept: 'application/json', 'Content-Type': 'application/json' },
          reqOpts.headers
        ),
        method: 'POST',
        url: `/outgoing-payments`
      })
      ctx.paymentPointer = paymentPointer
      ctx.request.body = options
      return ctx
    }

    test.each`
      description  | externalRef  | desc
      ${'rent'}    | ${undefined} | ${'description'}
      ${undefined} | ${'202201'}  | ${'externalRef'}
    `(
      'returns the outgoing payment on success ($desc)',
      async ({ description, externalRef }): Promise<void> => {
        const payment = await createPayment({
          paymentPointerId: paymentPointer.id,
          grant: referenceGrant.id,
          description,
          externalRef
        })
        options = {
          quoteId: `${paymentPointer.url}/quotes/${payment.quote.id}`,
          grant: referenceGrant.id,
          description,
          externalRef
        }
        const ctx = setup({})
        const outgoingPaymentService = await deps.use('outgoingPaymentService')
        const createSpy = jest
          .spyOn(outgoingPaymentService, 'create')
          .mockResolvedValueOnce(payment)
        await expect(outgoingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
        expect(createSpy).toHaveBeenCalledWith({
          paymentPointerId: paymentPointer.id,
          quoteId: payment.quote.id,
          description,
          externalRef
        })
        expect(ctx.response).toSatisfyApiSpec()
        const outgoingPaymentId = (
          (ctx.response.body as Record<string, unknown>)['id'] as string
        )
          .split('/')
          .pop()
        expect(ctx.response.body).toEqual({
          id: `${paymentPointer.url}/outgoing-payments/${outgoingPaymentId}`,
          paymentPointer: paymentPointer.url,
          receiver: payment.receiver,
          sendAmount: {
            ...payment.sendAmount,
            value: payment.sendAmount.value.toString()
          },
          receiveAmount: {
            ...payment.receiveAmount,
            value: payment.receiveAmount.value.toString()
          },
          description: options.description,
          externalRef: options.externalRef,
          sentAmount: {
            value: '0',
            assetCode: asset.code,
            assetScale: asset.scale
          },
          failed: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })
      }
    )
  })

  describe('list', (): void => {
    let grant: Grant
    beforeEach(async (): Promise<void> => {
      grant = new Grant({
        active: true,
        grant: referenceGrant.id,
        clientId: referenceGrant.clientId,
        access: [
          {
            type: AccessType.OutgoingPayment,
            actions: [AccessAction.List]
          }
        ]
      })
    })
    describe.each`
      withGrant | description
      ${false}  | ${'without grant'}
      ${true}   | ${'with grant'}
    `('$description', ({ withGrant }): void => {
      listTests({
        getPaymentPointer: () => paymentPointer,
        getGrant: () => (withGrant ? grant : undefined),
        getUrl: () => `/outgoing-payments`,
        createItem: async (index: number) => {
          const payment = await createPayment({
            paymentPointerId: paymentPointer.id,
            grant: referenceGrant.id,
            description: `p${index}`
          })
          return {
            id: `${paymentPointer.url}/outgoing-payments/${payment.id}`,
            paymentPointer: paymentPointer.url,
            receiver: payment.receiver,
            sendAmount: {
              ...payment.sendAmount,
              value: payment.sendAmount.value.toString()
            },
            receiveAmount: {
              ...payment.receiveAmount,
              value: payment.receiveAmount.value.toString()
            },
            sentAmount: {
              value: '0',
              assetCode: asset.code,
              assetScale: asset.scale
            },
            failed: false,
            description: payment.description,
            createdAt: payment.createdAt.toISOString(),
            updatedAt: payment.updatedAt.toISOString()
          }
        },
        list: (ctx: ListContext) => outgoingPaymentRoutes.list(ctx)
      })

      test('returns 500 for unexpected error', async (): Promise<void> => {
        const outgoingPaymentService = await deps.use('outgoingPaymentService')
        jest
          .spyOn(outgoingPaymentService, 'getPaymentPointerPage')
          .mockRejectedValueOnce(new Error('unexpected'))
        const ctx = createContext<ListContext>({
          headers: { Accept: 'application/json' }
        })
        ctx.paymentPointer = paymentPointer
        await expect(outgoingPaymentRoutes.list(ctx)).rejects.toMatchObject({
          status: 500,
          message: `Error trying to list outgoing payments`
        })
      })
    })
  })
})
