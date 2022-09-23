import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import jestOpenAPI from 'jest-openapi'
import { v4 as uuid } from 'uuid'

import { AppServices, ReadContext } from '../../app'
import { Config, IAppConfig } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'
import { initIocContainer } from '../../'
import { ConnectionRoutes } from './routes'
import { createContext } from '../../tests/context'
import { PaymentPointer } from '../payment_pointer/model'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import base64url from 'base64url'
import { GrantReference } from '../grantReference/model'
import { GrantReferenceService } from '../grantReference/service'

describe('Connection Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig
  let connectionRoutes: ConnectionRoutes
  let grantReferenceService: GrantReferenceService
  let grantRef: GrantReference

  beforeAll(async (): Promise<void> => {
    config = Config
    config.authServerGrantUrl = 'https://auth.wallet.example/authorize'
    deps = await initIocContainer(config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    grantReferenceService = await deps.use('grantReferenceService')
    jestOpenAPI(await deps.use('openApi'))
  })

  const asset = {
    code: 'USD',
    scale: 2
  }
  let paymentPointer: PaymentPointer
  let incomingPayment: IncomingPayment
  beforeEach(async (): Promise<void> => {
    connectionRoutes = await deps.use('connectionRoutes')
    config = await deps.use('config')

    paymentPointer = await createPaymentPointer(deps, { asset })
    grantRef = await grantReferenceService.create({
      id: uuid(),
      clientId: uuid()
    })
    incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId: paymentPointer.id,
      grantId: grantRef.id,
      description: 'hello world',
      expiresAt: new Date(Date.now() + 30_000),
      incomingAmount: {
        value: BigInt('123'),
        assetScale: asset.scale,
        assetCode: asset.code
      },
      externalRef: '#123'
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns 404 for nonexistent connection id on incoming payment', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/connections/${incomingPayment.connectionId}`
        },
        {
          connectionId: uuid()
        }
      )
      await expect(connectionRoutes.get(ctx)).rejects.toHaveProperty(
        'status',
        404
      )
    })

    test.each`
      state
      ${IncomingPaymentState.Completed}
      ${IncomingPaymentState.Expired}
    `(
      `returns 404 for $state incoming payment`,
      async ({ state }): Promise<void> => {
        await incomingPayment.$query(knex).patch({
          state,
          expiresAt:
            state === IncomingPaymentState.Expired ? new Date() : undefined
        })
        const ctx = createContext<ReadContext>(
          {
            headers: { Accept: 'application/json' },
            url: `/connections/${incomingPayment.connectionId}`
          },
          {
            connectionId: incomingPayment.connectionId
          }
        )
        await expect(connectionRoutes.get(ctx)).rejects.toHaveProperty(
          'status',
          404
        )
      }
    )

    test('returns 200 for correct connection id', async (): Promise<void> => {
      const ctx = createContext<ReadContext>(
        {
          headers: { Accept: 'application/json' },
          url: `/connections/${incomingPayment.connectionId}`
        },
        {
          connectionId: incomingPayment.connectionId
        }
      )
      await expect(connectionRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response).toSatisfyApiSpec()

      const sharedSecret = (ctx.response.body as Record<string, unknown>)[
        'sharedSecret'
      ]

      expect(ctx.body).toEqual({
        id: `${config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret,
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale
      })
      const sharedSecretBuffer = Buffer.from(sharedSecret as string, 'base64')
      expect(sharedSecretBuffer).toHaveLength(32)
      expect(sharedSecret).toEqual(base64url(sharedSecretBuffer))
    })
  })
})
