import * as crypto from 'crypto'
import { Knex } from 'knex'
import { createContext } from '../tests/context'
import { AppServices } from '../app'

import { SPSPRoutes } from './routes'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '../'
import { Config } from '../config/app'
import { PaymentPointer } from '../open_payments/payment_pointer/model'

import { IocContract } from '@adonisjs/fold'
import { StreamServer } from '@interledger/stream-receiver'
import { createPaymentPointer } from '../tests/paymentPointer'
import { truncateTables } from '../tests/tableManager'

describe('SPSP Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let spspRoutes: SPSPRoutes
  let streamServer: StreamServer
  const nonce = crypto.randomBytes(16).toString('base64')
  const secret = crypto.randomBytes(32).toString('base64')

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
  })

  beforeEach(async (): Promise<void> => {
    spspRoutes = await deps.use('spspRoutes')
    streamServer = await deps.use('streamServer')
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(knex)
    await appContainer.shutdown()
  })

  describe('GET /:id handler', (): void => {
    let paymentPointer: PaymentPointer

    beforeEach(async (): Promise<void> => {
      paymentPointer = await createPaymentPointer(deps, {
        asset: {
          scale: 6,
          code: 'USD'
        }
      })
    })

    test('wrong Accept; returns 406', async () => {
      const ctx = createContext({
        headers: { Accept: 'application/json' }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 406)
    })

    test('nonce, no secret; returns 400', async () => {
      const ctx = createContext({
        headers: { Accept: 'application/spsp4+json', 'Receipt-Nonce': nonce }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('secret; no nonce; returns 400', async () => {
      const ctx = createContext({
        headers: {
          Accept: 'application/spsp4+json',
          'Receipt-Secret': secret
        }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('malformed nonce; returns 400', async () => {
      const ctx = createContext({
        headers: {
          Accept: 'application/spsp4+json',
          'Receipt-Nonce': Buffer.alloc(15).toString('base64'),
          'Receipt-Secret': secret
        }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('no payment pointer; returns 404', async () => {
      const ctx = createContext({
        headers: { Accept: 'application/spsp4+json' }
      })
      await expect(spspRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response.status).toBe(404)
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')
      expect(JSON.parse(ctx.body as string)).toEqual({
        id: 'InvalidReceiverError',
        message: 'Invalid receiver ID'
      })
    })

    test('receipts disabled', async () => {
      const ctx = createContext({
        headers: { Accept: 'application/spsp4+json' }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

      const res = JSON.parse(ctx.body as string)
      expect(res.destination_account).toEqual(
        expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/)
      )
      expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
      expect(res.receipts_enabled).toBe(false)
      const connectionDetails = await decryptConnectionDetails(
        res.destination_account
      )
      expect(connectionDetails).toEqual({
        paymentTag: paymentPointer.id,
        asset: {
          code: 'USD',
          scale: 6
        }
      })
    })

    test('receipts enabled', async () => {
      const ctx = createContext({
        Accept: 'application/spsp4+json',
        headers: {
          'Receipt-Nonce': nonce,
          'Receipt-Secret': secret
        }
      })
      ctx.paymentPointer = paymentPointer
      await expect(spspRoutes.get(ctx)).resolves.toBeUndefined()
      expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

      const res = JSON.parse(ctx.body as string)
      expect(ctx.status).toBe(200)
      expect(res.destination_account).toEqual(
        expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{159}$/)
      )
      expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
      expect(res.receipts_enabled).toBe(true)
      const connectionDetails = await decryptConnectionDetails(
        res.destination_account
      )
      expect(connectionDetails).toEqual({
        paymentTag: paymentPointer.id,
        asset: {
          code: 'USD',
          scale: 6
        },
        receiptSetup: {
          nonce: Buffer.from(nonce, 'base64'),
          secret: Buffer.from(secret, 'base64')
        }
      })
    })

    /**
     * Utility functions
     */

    async function decryptConnectionDetails(
      destination: string
    ): Promise<unknown> {
      const token = streamServer['extractLocalAddressSegment'](destination)
      return streamServer['decryptToken'](Buffer.from(token, 'base64'))
    }
  })
})
