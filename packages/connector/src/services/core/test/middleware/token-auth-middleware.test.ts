import { createContext } from '../../../utils'
import { createTokenAuthMiddleware } from '../../middleware'
import { RafikiContext } from '../../rafiki'

describe('Token Auth Middleware', function () {
  describe('default behaviour', function () {
    test('returns 401 if there is no authorization header', async () => {
      const ctx = createContext<unknown, RafikiContext>({
        req: { headers: { 'content-type': 'application/octet-stream' } }
      })

      const authMiddleware = createTokenAuthMiddleware()

      await expect(authMiddleware(ctx, async () => {})).rejects.toThrow(
        'Bearer token required in Authorization header'
      )
    })

    test('returns 401 if bearer token is malformed', async () => {
      const ctx = createContext<unknown, RafikiContext>({
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

    test('default authentication fails if introspected token is not active', async () => {
      const ctx = createContext<unknown, RafikiContext>({
        req: {
          headers: {
            'content-type': 'application/octet-stream',
            authorization: 'Bearer asd123'
          }
        }
      })

      const authMiddleware = createTokenAuthMiddleware({
        introspect: (id: string) => {
          return Promise.resolve({ active: false })
        }
      })

      await expect(authMiddleware(ctx, async () => {})).rejects.toThrow(
        'Access Denied - Invalid Token'
      )
    })

    test('returns 401 if introspected token does not have a subject', async () => {
      const ctx = createContext<unknown, RafikiContext>({
        req: {
          headers: {
            'content-type': 'application/octet-stream',
            authorization: 'Bearer asd123'
          }
        }
      })

      const authMiddleware = createTokenAuthMiddleware({
        introspect: (id: string) => {
          return Promise.resolve({ active: true })
        }
      })

      await expect(authMiddleware(ctx, async () => {})).rejects.toThrow(
        'Access Denied - Invalid Token'
      )
    })

    test('succeeds for valid token and binds data to context', async () => {
      const ctx = createContext<unknown, RafikiContext>({
        req: {
          headers: {
            'content-type': 'application/octet-stream',
            authorization: 'Bearer asd123'
          }
        }
      })

      const authMiddleware = createTokenAuthMiddleware({
        introspect: (id: string) => {
          return Promise.resolve({ active: true, sub: 'alice' })
        }
      })

      await authMiddleware(ctx, async () => {})
      expect(ctx.state.token).toBe('asd123')
      expect(ctx.state.user).toStrictEqual({ active: true, sub: 'alice' })
    })
  })
})
