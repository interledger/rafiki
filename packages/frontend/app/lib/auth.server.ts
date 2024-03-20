// TODO: should cookie only store session ID and we use that to reference the access token on the server?
import { type Session, type SessionData } from '@remix-run/node'
import { createCookieSessionStorage } from '@remix-run/node'

const API_TOKEN_SESSION_NAME = 'api_token'

export const authStorage = createCookieSessionStorage<SessionData>({
  cookie: {
    name: '_rafiki_login',
    httpOnly: true,
    maxAge: 60 * 60, // TODO: what is a good time frame?
    path: '/',
    sameSite: 'lax',
    secrets: ['MY_SUPER_SECRET_TOKEN'], // TODO: manage secret
    secure: process.env.NODE_ENV === 'production'
  }
})

export function setApiToken(session: Session, apiToken: string) {
  session.set(API_TOKEN_SESSION_NAME, apiToken)
}

export function getApiToken(session: Session): string | null {
  return session.get(API_TOKEN_SESSION_NAME)
}
