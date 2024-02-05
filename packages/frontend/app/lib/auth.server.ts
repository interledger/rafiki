// TODO: cookie should only store session ID and that should be used to reference the login challenge and consent challenege and access token on the server
import { type Session, type SessionData, redirect } from '@remix-run/node'
import { createCookieSessionStorage } from '@remix-run/node'

export type AuthStorageData = {
  loginChallenge?: string
  consetChallenge?: string
}

export const authStorage = createCookieSessionStorage<
  SessionData,
  AuthStorageData
>({
  cookie: {
    name: '_rafiki_login',
    httpOnly: true,
    maxAge: 60 * 60, // TODO: investigate a good time frame
    path: '/',
    sameSite: 'lax',
    secrets: ['MY_SUPER_SECRET_TOKEN'],
    secure: process.env.NODE_ENV === 'production'
  }
})

export function setLoginSession(session: Session, loginChallenge: string) {
  session.set('login_challenge', loginChallenge)
}

export function setConsentSession(session: Session, consentChallenge: string) {
  session.set('consent_challenge', consentChallenge)
}

export function getLoginChallenge(session: Session): string | null {
  return session.get('login_challenge')
}

export function getConsentChallenge(session: Session): string | null {
  return session.get('consent_challenge')
}

export async function redirectWithChallenge(
  location: string,
  session: Session
) {
  return redirect(location, {
    headers: { 'Set-Cookie': await authStorage.commitSession(session) }
  })
}

type AuthRedirectArgs = {
  session: Session
  location: string
  challengeName: string
  challenge: string
}

export async function setChallengeAndRedirect(args: AuthRedirectArgs) {
  args.session.set(args.challengeName, args.challenge)
  return redirectWithChallenge(args.location, args.session)
}

// TODO: remove used login and consent challenges
export async function removeAuthSessionAndRedirect(session: Session, location: string){
  session.unset('login_challenge')
  session.unset('consent_challenge')
  return redirect(location, {
    headers: { 'Set-Cookie': await authStorage.commitSession(session) }
  })
}
