import jestOpenAPI from 'jest-openapi'
import base64url from 'base64url'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'

import { PaymentPointer } from '../../payment_pointer/model'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config, IAppConfig } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import {
  AppServices,
  ReadContext,
  CreateContext,
  CompleteContext,
  ListContext
} from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { IncomingPayment } from './model'
import { IncomingPaymentRoutes, CreateBody, MAX_EXPIRY } from './routes'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createPaymentPointer } from '../../../tests/paymentPointer'
import { Amount } from '@interledger/pay/dist/src/open-payments'
import { listTests, setup } from '../../../shared/routes.test'
import { AccessAction, AccessType, Grant } from '../../auth/grant'

describe('Incoming Payment Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let incomingPaymentRoutes: IncomingPaymentRoutes

  beforeAll(async (): Promise<void> => {
    config = Config
    config.publicHost = 'https://wallet.example'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    jestOpenAPI(await deps.use('openApi'))
  })

  const asset = {
    code: 'USD',
    scale: 2
  }
  let paymentPointer: PaymentPointer
  let paymentPointerId: string
  let expiresAt: Date
  let incomingAmount: Amount
  let description: string
  let externalRef: string
  let clientId: string

  beforeEach(async (): Promise<void> => {
    config = await deps.use('config')
    incomingPaymentRoutes = await deps.use('incomingPaymentRoutes')

    expiresAt = new Date(Date.now() + 30_000)
    paymentPointer = await createPaymentPointer(deps, { asset })
    paymentPointerId = `https://wallet.example/${paymentPointer.id}`
    incomingAmount = {
      value: BigInt('123'),
      assetScale: asset.scale,
      assetCode: asset.code
    }
    description = 'hello world'
    externalRef = '#123'
    clientId = uuid()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    let incomingPayment: IncomingPayment
    let grant: Grant
    beforeEach(async (): Promise<void> => {
      incomingPayment = await createIncomingPayment(deps, {
        paymentPointerId: paymentPointer.id,
        clientId,
        description,
        expiresAt,
        incomingAmount,
        externalRef
      })
      grant = new Grant({
        active: true,
        grant: 'PRY5NM33OM4TB8N6BW7',
        clientId,
        access: [
          {
            type: AccessType.IncomingPayment,
            actions: [AccessAction.ReadAll]
          }
        ]
      })
    })
    describe.each`
      withGrant | description
      ${false}  | ${'without grant'}
      ${true}   | ${'with grant'}
    `('$description', ({ withGrant }): void => {
      test('returns 404 on unknown incoming payment', async (): Promise<void> => {
        const ctx = setup<ReadContext>(
          {
            headers: { Accept: 'application/json' }
          },
          {
            incomingPaymentId: uuid(),
            accountId: paymentPointer.id
          },
          withGrant ? grant : undefined
        )
        await expect(incomingPaymentRoutes.get(ctx)).rejects.toMatchObject({
          status: 404,
          message: 'Not Found'
        })
      })

      test('returns 200 with an open payments incoming payment', async (): Promise<void> => {
        const ctx = setup<ReadContext>(
          {
            headers: { Accept: 'application/json' },
            method: 'GET',
            url: `/${paymentPointer.id}/incoming-payments/${incomingPayment.id}`
          },
          {
            incomingPaymentId: incomingPayment.id,
            accountId: paymentPointer.id
          },
          withGrant ? grant : undefined
        )
        await expect(incomingPaymentRoutes.get(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()

        const sharedSecret = (
          (ctx.response.body as Record<string, unknown>)[
            'ilpStreamConnection'
          ] as Record<string, unknown>
        )['sharedSecret']

        expect(ctx.body).toEqual({
          id: `${paymentPointerId}/incoming-payments/${incomingPayment.id}`,
          // paymentPointer: paymentPointerId,
          accountId: paymentPointerId,
          completed: false,
          incomingAmount: {
            value: '123',
            assetCode: asset.code,
            assetScale: asset.scale
          },
          description: incomingPayment.description,
          expiresAt: expiresAt.toISOString(),
          createdAt: incomingPayment.createdAt.toISOString(),
          updatedAt: incomingPayment.updatedAt.toISOString(),
          receivedAmount: {
            value: '0',
            assetCode: asset.code,
            assetScale: asset.scale
          },
          externalRef: '#123',
          ilpStreamConnection: {
            id: `${config.publicHost}/connections/${incomingPayment.connectionId}`,
            ilpAddress: expect.stringMatching(
              /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
            ),
            sharedSecret
          }
        })
        const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
        expect(sharedSecretBuffer).toHaveLength(32)
        expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
      })
    })
    describe('create', (): void => {
      test('returns error on distant-future expiresAt', async (): Promise<void> => {
        const ctx = setup<CreateContext<CreateBody>>(
          { body: {} },
          { accountId: paymentPointer.id }
        )
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
          const grant = new Grant({
            active: true,
            grant: 'PRY5NM33OM4TB8N6BW7',
            clientId,
            access: [
              {
                type: AccessType.IncomingPayment,
                actions: [AccessAction.Create]
              }
            ]
          })
          const ctx = setup<CreateContext<CreateBody>>(
            {
              body: {
                incomingAmount,
                description,
                externalRef,
                expiresAt
              },
              method: 'POST',
              url: `/${paymentPointer.id}/incoming-payments`
            },
            { accountId: paymentPointer.id },
            grant
          )
          await expect(
            incomingPaymentRoutes.create(ctx)
          ).resolves.toBeUndefined()
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
            id: `${paymentPointerId}/incoming-payments/${incomingPaymentId}`,
            // paymentPointer: paymentPointerId,
            accountId: paymentPointerId,
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
              id: `${config.publicHost}/connections/${connectionId}`,
              ilpAddress: expect.stringMatching(
                /^test\.rafiki\.[a-zA-Z0-9_-]{95}$/
              ),
              sharedSecret: expect.any(String)
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
          clientId,
          description,
          expiresAt,
          incomingAmount,
          externalRef
        })
      })
      test('returns 200 with an updated open payments incoming payment', async (): Promise<void> => {
        const ctx = setup<CompleteContext>(
          {
            headers: { Accept: 'application/json' },
            method: 'POST',
            url: `/${paymentPointer.id}/incoming-payments/${incomingPayment.id}/complete`
          },
          {
            incomingPaymentId: incomingPayment.id,
            accountId: paymentPointer.id
          }
        )
        await expect(
          incomingPaymentRoutes.complete(ctx)
        ).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.body).toEqual({
          id: `${paymentPointerId}/incoming-payments/${incomingPayment.id}`,
          // paymentPointer: paymentPointerId,
          accountId: paymentPointerId,
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
          completed: true,
          ilpStreamConnection: `${config.publicHost}/connections/${incomingPayment.connectionId}`
        })
      })
    })
  })

  describe('list', (): void => {
    let grant
    beforeEach(async (): Promise<void> => {
      grant = new Grant({
        active: true,
        grant: 'PRY5NM33OM4TB8N6BW7',
        clientId,
        access: [
          {
            type: AccessType.IncomingPayment,
            actions: [AccessAction.ListAll]
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
        getPaymentPointerId: () => paymentPointer.id,
        getGrant: () => (withGrant ? grant : undefined),
        getUrl: () => `/${paymentPointer.id}/incoming-payments`,
        createItem: async (index: number) => {
          const payment = await createIncomingPayment(deps, {
            paymentPointerId: paymentPointer.id,
            clientId,
            description: `p${index}`,
            expiresAt
          })
          return {
            id: `${paymentPointerId}/incoming-payments/${payment.id}`,
            // paymentPointer: paymentPointerId,
            accountId: paymentPointerId,
            receivedAmount: {
              value: '0',
              assetCode: asset.code,
              assetScale: asset.scale
            },
            description: payment.description,
            completed: false,
            expiresAt: expiresAt.toISOString(),
            createdAt: payment.createdAt.toISOString(),
            updatedAt: payment.updatedAt.toISOString(),
            ilpStreamConnection: `${config.publicHost}/connections/${payment.connectionId}`
          }
        },
        list: (ctx: ListContext) => incomingPaymentRoutes.list(ctx)
      })

      test('returns 500 for unexpected error', async (): Promise<void> => {
        const incomingPaymentService = await deps.use('incomingPaymentService')
        jest
          .spyOn(incomingPaymentService, 'getPaymentPointerPage')
          .mockRejectedValueOnce(new Error('unexpected'))
        const ctx = setup<ListContext>(
          {
            headers: { Accept: 'application/json' }
          },
          { accountId: paymentPointerId },
          withGrant ? grant : undefined
        )
        await expect(incomingPaymentRoutes.list(ctx)).rejects.toMatchObject({
          status: 500,
          message: `Error trying to list incoming payments`
        })
      })
    })
  })
})
