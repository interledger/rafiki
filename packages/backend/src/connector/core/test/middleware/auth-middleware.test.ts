/* eslint-disable @typescript-eslint/no-empty-function */
import { createContext } from '../../utils'
import { createTokenAuthMiddleware } from '../../middleware'
import { MockAccountingService } from '../mocks/accounting-service'
import { HttpContext } from '../../rafiki'
import { IncomingPeerFactory, RafikiServicesFactory } from '../../factories'

describe('Token Auth Middleware', function () {
  describe('default behaviour', function () {
    test('returns 401 if there is no authorization header', async () => {
      const ctx = createContext<unknown, HttpContext>({
        req: { headers: { 'content-type': 'application/octet-stream' } }
      })

      const authMiddleware = createTokenAuthMiddleware()

      await expect(authMiddleware(ctx, async () => {})).rejects.toThrow(
        'Bearer token required in Authorization header'
      )
    })

    test('returns 401 if bearer token is malformed', async () => {
      const ctx = createContext<unknown, HttpContext>({
        req: {
          headers: {
            'content-type': 'application/octet-stream',
            authorization: 'Bearer'
          }
        }
      })

      const authMiddleware = createTokenAuthMiddleware()

      await expect(authMiddleware(ctx, async () => {})).rejects.toThrow(
        'Bearer token required in Authorization header'
      )
    })

    test('succeeds for valid token and binds data to context', async () => {
      const accounting = new MockAccountingService()
      const ctx = createContext<unknown, HttpContext>({
        req: {
          headers: {
            'content-type': 'application/octet-stream',
            authorization: 'Bearer asd123'
          }
        },
        services: RafikiServicesFactory.build({ accounting })
      })
      const account = IncomingPeerFactory.build({
        id: 'alice',
        http: {
          incoming: {
            authTokens: ['asd123']
          }
        }
      })
      await accounting.create(account)

      await createTokenAuthMiddleware()(ctx, async () => {})
      expect(ctx.state.incomingAccount).toMatchObject(account)
    })
  })
})
