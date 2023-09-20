import { faker } from '@faker-js/faker'
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
import { Grant } from '../../auth/middleware'
import { WalletAddress } from '../../wallet_address/model'
import {
  getRouteTests,
  setup as setupContext
} from '../../wallet_address/model.test'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'

describe('Outgoing Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let outgoingPaymentRoutes: OutgoingPaymentRoutes
  let outgoingPaymentService: OutgoingPaymentService
  let walletAddress: WalletAddress

  const receivingWalletAddress = `https://wallet.example/${uuid()}`

  const createPayment = async (options: {
    client?: string
    grant?: Grant
    metadata?: Record<string, unknown>
  }): Promise<OutgoingPayment> => {
    return await createOutgoingPayment(deps, {
      ...options,
      walletAddressId: walletAddress.id,
      receiver: `${receivingWalletAddress}/incoming-payments/${uuid()}`,
      debitAmount: {
        value: BigInt(56),
        assetCode: walletAddress.asset.code,
        assetScale: walletAddress.asset.scale
      },
      validDestination: false
    })
  }

  beforeAll(async (): Promise<void> => {
    config = Config
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    config = await deps.use('config')
    outgoingPaymentRoutes = await deps.use('outgoingPaymentRoutes')
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    const { resourceServerSpec } = await deps.use('openApi')
    jestOpenAPI(resourceServerSpec)
  })

  beforeEach(async (): Promise<void> => {
    const asset = await createAsset(deps)
    walletAddress = await createWalletAddress(deps, { assetId: asset.id })
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
      getWalletAddress: async () => walletAddress,
      createModel: async ({ client }) => {
        const outgoingPayment = await createPayment({
          client,
          metadata: {
            description: 'rent',
            externalRef: '202201'
          }
        })
        if (failed) {
          await outgoingPayment
            .$query(knex)
            .patch({ state: OutgoingPaymentState.Failed })
        }
        return outgoingPayment
      },
      get: (ctx) => outgoingPaymentRoutes.get(ctx),
      getBody: (outgoingPayment) => {
        return {
          id: `${walletAddress.url}/outgoing-payments/${outgoingPayment.id}`,
          walletAddress: walletAddress.url,
          receiver: outgoingPayment.receiver,
          quoteId: outgoingPayment.quote.getUrl(walletAddress),
          debitAmount: serializeAmount(outgoingPayment.debitAmount),
          sentAmount: serializeAmount(outgoingPayment.sentAmount),
          receiveAmount: serializeAmount(outgoingPayment.receiveAmount),
          metadata: outgoingPayment.metadata,
          failed,
          createdAt: outgoingPayment.createdAt.toISOString(),
          updatedAt: outgoingPayment.updatedAt.toISOString()
        }
      },
      list: (ctx) => outgoingPaymentRoutes.list(ctx),
      urlPath: OutgoingPayment.urlPath
    })

    test('returns 500 for unexpected error', async (): Promise<void> => {
      jest
        .spyOn(outgoingPaymentService, 'getWalletAddressPage')
        .mockRejectedValueOnce(new Error('unexpected'))
      const ctx = setupContext<ListContext>({
        reqOpts: {},
        walletAddress
      })
      await expect(outgoingPaymentRoutes.list(ctx)).rejects.toMatchObject({
        status: 500,
        message: `Error trying to list outgoing payments`
      })
    })
  })

  describe('create', (): void => {
    const setup = (
      options: Omit<CreateOutgoingPaymentOptions, 'walletAddressId'>
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
        walletAddress,
        client: options.client,
        grant: options.grant
      })

    describe.each`
      grant             | client                                        | description
      ${{ id: uuid() }} | ${faker.internet.url({ appendSlash: false })} | ${'grant'}
      ${undefined}      | ${undefined}                                  | ${'no grant'}
    `('create ($description)', ({ grant, client }): void => {
      test('returns the outgoing payment on success (metadata)', async (): Promise<void> => {
        const metadata = {
          description: 'rent',
          externalRef: '202201'
        }
        const payment = await createPayment({
          client,
          grant,
          metadata
        })
        const options = {
          quoteId: `${walletAddress.url}/quotes/${payment.quote.id}`,
          client,
          grant,
          metadata
        }
        const ctx = setup(options)
        const createSpy = jest
          .spyOn(outgoingPaymentService, 'create')
          .mockResolvedValueOnce(payment)
        await expect(outgoingPaymentRoutes.create(ctx)).resolves.toBeUndefined()
        expect(createSpy).toHaveBeenCalledWith({
          walletAddressId: walletAddress.id,
          quoteId: payment.quote.id,
          metadata,
          client,
          grant
        })
        expect(ctx.response).toSatisfyApiSpec()
        const outgoingPaymentId = (
          (ctx.response.body as Record<string, unknown>)['id'] as string
        )
          .split('/')
          .pop()
        expect(ctx.response.body).toEqual({
          id: `${walletAddress.url}/outgoing-payments/${outgoingPaymentId}`,
          walletAddress: walletAddress.url,
          receiver: payment.receiver,
          quoteId: options.quoteId,
          debitAmount: {
            ...payment.debitAmount,
            value: payment.debitAmount.value.toString()
          },
          receiveAmount: {
            ...payment.receiveAmount,
            value: payment.receiveAmount.value.toString()
          },
          metadata: options.metadata,
          sentAmount: {
            value: '0',
            assetCode: walletAddress.asset.code,
            assetScale: walletAddress.asset.scale
          },
          failed: false,
          createdAt: expect.any(String),
          updatedAt: expect.any(String)
        })
      })
    })

    test.each(Object.values(OutgoingPaymentError).map((err) => [err]))(
      'returns error on %s',
      async (error): Promise<void> => {
        const quoteId = uuid()
        const ctx = setup({
          quoteId: `${walletAddress.url}/quotes/${quoteId}`
        })
        const createSpy = jest
          .spyOn(outgoingPaymentService, 'create')
          .mockResolvedValueOnce(error)
        await expect(outgoingPaymentRoutes.create(ctx)).rejects.toMatchObject({
          message: errorToMessage[error],
          status: errorToCode[error]
        })
        expect(createSpy).toHaveBeenCalledWith({
          walletAddressId: walletAddress.id,
          quoteId
        })
      }
    )
  })
})
