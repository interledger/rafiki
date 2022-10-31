import jestOpenAPI from 'jest-openapi'
import * as httpMocks from 'node-mocks-http'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createContext } from '../../../tests/context'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices, CreateContext, ListContext } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { randomAsset } from '../../../tests/asset'
import { CreateOutgoingPaymentOptions } from './service'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { OutgoingPaymentRoutes, CreateBody } from './routes'
import { serializeAmount } from '../../amount'
import { PaymentPointer } from '../../payment_pointer/model'
import { getRouteTests } from '../../payment_pointer/model.test'
import { createGrant } from '../../../tests/grant'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { AccessAction, AccessType, Grant } from '../../auth/grant'

describe('Outgoing Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let outgoingPaymentRoutes: OutgoingPaymentRoutes
  let paymentPointer: PaymentPointer

  const receivingPaymentPointer = `https://wallet.example/${uuid()}`
  const asset = randomAsset()

  const createPayment = async (options: {
    paymentPointerId: string
    grant?: Grant
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
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    config = await deps.use('config')
    outgoingPaymentRoutes = await deps.use('outgoingPaymentRoutes')
    jestOpenAPI(await deps.use('openApi'))
  })

  beforeEach(async (): Promise<void> => {
    paymentPointer = await createPaymentPointer(deps, { asset })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe.each`
    failed   | description
    ${false} | ${''}
    ${true}  | ${' failed'}
  `('get/list$description outgoing payment', ({ failed }): void => {
    getRouteTests({
      createGrant: async ({ clientId }) =>
        createGrant(deps, {
          clientId,
          access: [
            {
              type: AccessType.OutgoingPayment,
              actions: [AccessAction.Create, AccessAction.Read]
            }
          ]
        }),
      getPaymentPointer: async () => paymentPointer,
      createModel: async ({ grant }) => {
        const outgoingPayment = await createPayment({
          paymentPointerId: paymentPointer.id,
          grant,
          description: 'rent',
          externalRef: '202201'
        })
        if (failed) {
          await outgoingPayment
            .$query(knex)
            .patch({ state: OutgoingPaymentState.Failed })
        }
        return outgoingPayment
      },
      get: (ctx) => outgoingPaymentRoutes.get(ctx),
      getBody: (outgoingPayment) => ({
        id: `${paymentPointer.url}/outgoing-payments/${outgoingPayment.id}`,
        paymentPointer: paymentPointer.url,
        receiver: outgoingPayment.receiver,
        sendAmount: serializeAmount(outgoingPayment.sendAmount),
        sentAmount: serializeAmount(outgoingPayment.sentAmount),
        receiveAmount: serializeAmount(outgoingPayment.receiveAmount),
        description: outgoingPayment.description,
        externalRef: outgoingPayment.externalRef,
        failed,
        createdAt: outgoingPayment.createdAt.toISOString(),
        updatedAt: outgoingPayment.updatedAt.toISOString()
      }),
      list: (ctx) => outgoingPaymentRoutes.list(ctx),
      urlPath: OutgoingPayment.urlPath
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

  describe.each`
    withGrant | description
    ${true}   | ${'grant'}
    ${false}  | ${'no grant'}
  `('create ($description)', ({ withGrant }): void => {
    let options: Omit<CreateOutgoingPaymentOptions, 'paymentPointerId'>
    let grant: Grant | undefined

    beforeEach(async (): Promise<void> => {
      options = {
        quoteId: `${paymentPointer.url}/quotes/${uuid()}`
      }

      grant = withGrant
        ? await createGrant(deps, {
            access: [
              {
                type: AccessType.OutgoingPayment,
                actions: [AccessAction.Create, AccessAction.Read]
              }
            ]
          })
        : undefined
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
      ctx.grant = grant
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
          grant,
          description,
          externalRef
        })
        options = {
          quoteId: `${paymentPointer.url}/quotes/${payment.quote.id}`,
          grant,
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
          externalRef,
          grant
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
})
