import * as crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import assert from 'assert'

import { AppServices, SPSPContext } from '../../../app'
import { SPSPRoutes } from './routes'
import { createTestApp, TestContainer } from '../../../tests/app'
import { initIocContainer } from '../../..'
import { AssetOptions } from '../../../asset/service'
import { Config } from '../../../config/app'

import { IocContract } from '@adonisjs/fold'
import { StreamServer } from '@interledger/stream-receiver'
import { randomAsset } from '../../../tests/asset'
import { createContext } from '../../../tests/context'
import { truncateTables } from '../../../tests/tableManager'
import { SPSPRouteError } from './middleware'

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
    await truncateTables(deps)
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

    test.each`
      acceptHeader
      ${'application/json'}
      ${'*/*'}
    `(
      'Request with incorrect header ($acceptHeader) returns 406',
      async ({ acceptHeader }) => {
        const ctx = createContext<SPSPContext>({
          headers: { Accept: acceptHeader }
        })

        expect.assertions(2)
        try {
          await spspRoutes.get(ctx)
        } catch (err) {
          assert.ok(err instanceof SPSPRouteError)
          expect(err.status).toBe(406)
          expect(err.message).toBe(
            'Request does not support application/spsp4+json'
          )
        }
      }
    )

    test('nonce, no secret; returns 400', async () => {
      const ctx = setup({ nonce })

      expect.assertions(2)
      try {
        await spspRoutes.get(ctx)
      } catch (err) {
        assert.ok(err instanceof SPSPRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe(
          'Failed to generate credentials: receipt nonce and secret must accompany each other'
        )
      }
    })

    test('secret; no nonce; returns 400', async () => {
      const ctx = setup({ secret })
      expect.assertions(2)
      try {
        await spspRoutes.get(ctx)
      } catch (err) {
        assert.ok(err instanceof SPSPRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe(
          'Failed to generate credentials: receipt nonce and secret must accompany each other'
        )
      }
    })

    test('malformed nonce; returns 400', async () => {
      const ctx = setup({
        nonce: Buffer.alloc(15).toString('base64'),
        secret
      })

      expect.assertions(2)
      try {
        await spspRoutes.get(ctx)
      } catch (err) {
        assert.ok(err instanceof SPSPRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe(
          'Failed to generate credentials: receipt nonce must be 16 bytes'
        )
      }
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

    test('handle error when generating credentials', async () => {
      const ctx = setup()

      jest
        .spyOn(streamServer, 'generateCredentials')
        .mockImplementationOnce(() => {
          throw new Error('Could not generate credentials')
        })

      expect.assertions(2)
      try {
        await spspRoutes.get(ctx)
      } catch (err) {
        assert.ok(err instanceof SPSPRouteError)
        expect(err.status).toBe(400)
        expect(err.message).toBe('Could not generate credentials')
      }
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
