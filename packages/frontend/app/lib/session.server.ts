import { createCookieSessionStorage } from '@remix-run/node'

const { getSession, commitSession, destroySession } =
  createCookieSessionStorage({
    cookie: {
      name: '__session',
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      secrets: ['MY_SUPER_SECRET_TOKEN']
    }
  })

export { getSession, commitSession, destroySession }
