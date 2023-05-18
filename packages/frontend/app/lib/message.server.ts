import { type SessionData } from '@remix-run/node'
import { createCookieSessionStorage } from '@remix-run/node'

export type MessageType = 'success' | 'error'
export type Message = { content: string; type: MessageType }
export type MessageStorageFlashData = {
  message: Message
}

export const messageStorage = createCookieSessionStorage<
  SessionData,
  MessageStorageFlashData
>({
  cookie: {
    name: '__message',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 60, // one minute
    secrets: 'MY_SUPER_SECRET_TOKEN',
    secure: process.env.NODE_ENV === 'production'
  }
})
