import { createCookieSessionStorage } from '@remix-run/node'
import { getCookieSecrets } from './cookie_secret.server'

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: '__session',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      secrets: getCookieSecrets()
    }
  })

export { getSession, commitSession, destroySession }
