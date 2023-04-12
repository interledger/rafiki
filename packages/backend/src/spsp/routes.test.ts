import * as crypto from 'crypto'
import { v4 as uuid } from 'uuid'

import { AppServices, SPSPContext } from '../app'
import { SPSPRoutes } from './routes'
import { createTestApp, TestContainer } from '../tests/app'
import { initIocContainer } from '../'
import { AssetOptions } from '../asset/service'
import { Config } from '../config/app'

import { IocContract } from '@adonisjs/fold'
import { StreamServer } from '@interledger/stream-receiver'
import { randomAsset } from '../tests/asset'
import { createContext } from '../tests/context'
import { truncateTables } from '../tests/tableManager'

type SPSPHeader = {
  Accept: string
  'Receipt-Nonce'?: string
  'Receipt-Secret'?: string
}

describe('SPSP Routes', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let spspRoutes: SPSPRoutes
  let streamServer: StreamServer
  const nonce = crypto.randomBytes(16).toString('base64')
  const secret = crypto.randomBytes(32).toString('base64')

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async (): Promise<void> => {
    spspRoutes = await deps.use('spspRoutes')
    streamServer = await deps.use('streamServer')
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
    await appContainer.shutdown()
  })

  describe('GET /:id handler', (): void => {
    const setup = ({
      paymentTag,
      asset,
      nonce,
      secret
    }: {
      paymentTag?: string
      asset?: AssetOptions
      nonce?: string
      secret?: string
    } = {}): SPSPContext => {
      const headers: SPSPHeader = {
        Accept: 'application/spsp4+json'
      }
      if (nonce) {
        headers['Receipt-Nonce'] = nonce
      }
      if (secret) {
        headers['Receipt-Secret'] = secret
      }
      const ctx = createContext<SPSPContext>({
        headers
      })
      ctx.paymentTag = paymentTag || uuid()
      ctx.asset = asset || randomAsset()
      return ctx
    }

    test('wrong Accept; returns 406', async () => {
      const ctx = createContext<SPSPContext>({
        headers: { Accept: 'application/json' }
      })
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 406)
    })

    test('nonce, no secret; returns 400', async () => {
      const ctx = setup({ nonce })
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('secret; no nonce; returns 400', async () => {
      const ctx = setup({ secret })
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    test('malformed nonce; returns 400', async () => {
      const ctx = setup({
        nonce: Buffer.alloc(15).toString('base64'),
        secret
      })
      await expect(spspRoutes.get(ctx)).rejects.toHaveProperty('status', 400)
    })

    const receiptSetup = {
      nonce: Buffer.from(nonce, 'base64'),
      secret: Buffer.from(secret, 'base64')
    }

    test.each`
      nonce        | secret       | addressLength | receiptSetup    | description
      ${undefined} | ${undefined} | ${95}         | ${undefined}    | ${'receipts disabled'}
      ${nonce}     | ${secret}    | ${159}        | ${receiptSetup} | ${'receipts enabled'}
    `(
      'generates payment details ($description)',
      async ({ nonce, secret, addressLength, receiptSetup }): Promise<void> => {
        const paymentTag = uuid()
        const asset = randomAsset()
        const ctx = setup({
          paymentTag,
          asset,
          nonce,
          secret
        })
        await expect(spspRoutes.get(ctx)).resolves.toBeUndefined()
        expect(ctx.response.get('Content-Type')).toBe('application/spsp4+json')

        const res = JSON.parse(ctx.body as string)
        const regex = new RegExp(
          `^test.rafiki.[a-zA-Z0-9_-]{${addressLength}}$`
        )

        expect(res.destination_account).toEqual(expect.stringMatching(regex))
        expect(Buffer.from(res.shared_secret, 'base64')).toHaveLength(32)
        expect(res.receipts_enabled).toBe(!!receiptSetup)
        const connectionDetails = await decryptConnectionDetails(
          res.destination_account
        )
        expect(connectionDetails).toEqual({
          paymentTag,
          asset,
          receiptSetup
        })
      }
    )

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
