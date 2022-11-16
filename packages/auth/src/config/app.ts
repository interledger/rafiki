import * as crypto from 'crypto'

function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

function envBool(name: string, value: boolean): boolean {
  const envValue = process.env[name]
  return envValue == null ? value : envValue === 'true'
}
export type IAppConfig = typeof Config

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 3006),
  env: envString('NODE_ENV', 'development'),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.AUTH_DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'AUTH_DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/auth_development'
        ),
  identityServerDomain: envString(
    'IDENTITY_SERVER_DOMAIN',
    'http://localhost:3030/mock-idp/'
  ),
  identityServerSecret: envString('IDENTITY_SERVER_SECRET', 'replace-me'),
  authServerDomain: envString(
    'AUTH_SERVER_DOMAIN',
    `http://localhost:${envInt('PORT', 3006)}`
  ), // TODO: replace this with whatever frontend port ends up being
  waitTimeSeconds: envInt('WAIT_SECONDS', 5),
  cookieKey: envString('COOKIE_KEY', crypto.randomBytes(32).toString('hex')),
  accessTokenExpirySeconds: envInt('ACCESS_TOKEN_EXPIRY_SECONDS', 10 * 60), // Default 10 minutes
  databaseCleanupWorkers: envInt('DATABASE_CLEANUP_WORKERS', 1),
  accessTokenDeletionDays: envInt('ACCESS_TOKEN_DELETION_DAYS', 30),
  introspectionHttpsig: envBool('INTROSPECTION_HTTPSIG', false),
  incomingPaymentInteraction: envBool('INCOMING_PAYMENT_INTERACTION', false),
  bypassSignatureValidation: envBool('BYPASS_SIGNATURE_VALIDATION', false)
}
