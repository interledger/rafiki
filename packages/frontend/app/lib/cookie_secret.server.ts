import { randomBytes } from 'node:crypto'
import { logger } from '~/utils/logger.server'

// Fallback for local development only. It is public, so anyone can sign a
// cookie with it.
const DEVELOPMENT_COOKIE_SECRET = 'development-only-cookie-secret'

let generatedSecret: string | undefined

// Secrets that sign the `__session` and `__message` cookies.
//
// Set COOKIE_SECRET in production. Without it, a random secret is generated
// when the process starts: cookies are valid only for that process, so they
// stop working after a restart and between replicas.
export function getCookieSecrets(): string[] {
  const secret = process.env.COOKIE_SECRET

  if (secret) return [secret]

  if (process.env.NODE_ENV !== 'production') return [DEVELOPMENT_COOKIE_SECRET]

  if (!generatedSecret) {
    generatedSecret = randomBytes(32).toString('hex')
    logger.warn(
      'COOKIE_SECRET is not set. Using a random secret for this process: cookies stop working after a restart and between replicas.'
    )
  }

  return [generatedSecret]
}
