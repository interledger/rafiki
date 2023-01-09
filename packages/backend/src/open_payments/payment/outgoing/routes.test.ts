import jestOpenAPI from 'jest-openapi'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices, CreateContext, ListContext } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { createAsset } from '../../../tests/asset'
import { errorToCode, errorToMessage, OutgoingPaymentError } from './errors'
import { CreateOutgoingPaymentOptions, OutgoingPaymentService } from './service'
import { OutgoingPayment, OutgoingPaymentState } from './model'
import { OutgoingPaymentRoutes, CreateBody } from './routes'
import { serializeAmount } from '../../amount'
import { PaymentPointer } from '../../payment_pointer/model'
import {
  getRouteTests,
  setup as setupContext
} from '../../payment_pointer/model.test'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { AccessAction, AccessType, Grant } from '../../auth/grant'

describe('Outgoing Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let outgoingPaymentRoutes: OutgoingPaymentRoutes
  let outgoingPaymentService: OutgoingPaymentService
  let paymentPointer: PaymentPointer

  const receivingPaymentPointer = `https://wallet.example/${uuid()}`

  const createPayment = async (options: {
    grant?: Grant
    description?: string
    externalRef?: string
  }): Promise<OutgoingPayment> => {
    return await createOutgoingPayment(deps, {
      ...options,
      paymentPointerId: paymentPointer.id,
      receiver: `${receivingPaymentPointer}/incoming-payments/${uuid()}`,
      sendAmount: {
        value: BigInt(56),
        assetCode: paymentPointer.asset.code,
        assetScale: paymentPointer.asset.scale
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
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
  })

  beforeEach(async (): Promise<void> => {
    const asset = await createAsset(deps)
    paymentPointer = await createPaymentPointer(deps, { assetId: asset.id })
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
      getPaymentPointer: async () => paymentPointer,
      createModel: async ({ clientId }) => {
        const grant = clientId
          ? new Grant({
              active: true,
              clientId,
              grant: uuid(),
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read]
                }
              ]
            })
          : undefined
        const outgoingPayment = await createPayment({
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
      jest
        .spyOn(outgoingPaymentService, 'getPaymentPointerPage')
        .mockRejectedValueOnce(new Error('unexpected'))
      const ctx = setupContext<ListContext>({
        reqOpts: {},
        paymentPointer
      })
      await expect(outgoingPaymentRoutes.list(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Error trying to list outgoing payments`
      })
    })
  })

  describe('create', (): void => {
    const setup = (
      options: Omit<CreateOutgoingPaymentOptions, 'paymentPointerId'>
    ): CreateContext<CreateBody> =>
      setupContext<CreateContext<CreateBody>>({
        reqOpts: {
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json'
          },
          method: 'POST',
          url: `/outgoing-payments`,
          body: options
        },
        paymentPointer,
        grant: options.grant
      })

    describe.each`
      withGrant | description
      ${true}   | ${'grant'}
      ${false}  | ${'no grant'}
    `('create ($description)', ({ withGrant }): void => {
      let grant: Grant | undefined

      beforeEach(async (): Promise<void> => {
        grant = withGrant
          ? new Grant({
              active: true,
              grant: uuid(),
              clientId: uuid(),
              access: [
                {
                  type: AccessType.OutgoingPayment,
                  actions: [AccessAction.Create, AccessAction.Read]
                }
              ]
            })
          : undefined
      })

      test.each`
        description  | externalRef  | desc
        ${'rent'}    | ${undefined} | ${'description'}
        ${undefined} | ${'202201'}  | ${'externalRef'}
      `(
        'returns the outgoing payment on success ($desc)',
        async ({ description, externalRef }): Promise<void> => {
          const payment = await createPayment({
            grant,
            description,
            externalRef
          })
          const options = {
            quoteId: `${paymentPointer.url}/quotes/${payment.quote.id}`,
            grant,
            description,
            externalRef
          }
          const ctx = setup(options)
          const createSpy = jest
            .spyOn(outgoingPaymentService, 'create')
            .mockResolvedValueOnce(payment)
          await expect(
            outgoingPaymentRoutes.create(ctx)
          ).resolves.toBeUndefined()
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
              assetCode: paymentPointer.asset.code,
              assetScale: paymentPointer.asset.scale
            },
            failed: false,
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
          })
        }
      )
    })

    test.each(Object.values(OutgoingPaymentError).map((err) => [err]))(
      'returns error on %s',
      async (error): Promise<void> => {
        const quoteId = uuid()
        const ctx = setup({
          quoteId: `${paymentPointer.url}/quotes/${quoteId}`
        })
        const createSpy = jest
          .spyOn(outgoingPaymentService, 'create')
          .mockResolvedValueOnce(error)
        await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: errorToMessage[error],
          status: errorToCode[error]
        })
        expect(createSpy).toHaveBeenCalledWith({
          paymentPointerId: paymentPointer.id,
          quoteId
        })
      }
    )
  })
})
