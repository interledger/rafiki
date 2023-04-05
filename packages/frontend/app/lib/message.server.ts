import type { Session } from '@remix-run/node'
import { createCookieSessionStorage } from '@remix-run/node'

export type MessageType = 'success' | 'error' | 'info'
export type Message = { content: string; type: MessageType }

const ONE_YEAR = 1000 * 60 * 60 * 24 * 365

export const { commitSession, getSession } = createCookieSessionStorage({
  cookie: {
    name: '__message',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    expires: new Date(Date.now() + ONE_YEAR),
    secrets: ['MY_SUPER_SECRET_TOKEN'],
    secure: true
  }
})

export function setMessage(session: Session, message: Message) {
  session.flash('message', message)
}

export function setErrorMessage(session: Session, message: string) {
  session.flash('message', message)
}
