import * as crypto from 'crypto'

function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
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
  authServerSpec: envString(
    'AUTH_SERVER_SPEC',
    // TODO: replace with commit on main once it's merged in
    'https://raw.githubusercontent.com/interledger/open-payments/0551bb8929931750e298ae177f6459118d8936e3/auth-server-open-api-spec.yaml'
  ),
  identityServerDomain: envString(
    'IDENTITY_SERVER_DOMAIN',
    'http://localhost:3004'
  ),
  authServerDomain: envString('AUTH_SERVER_DOMAIN', 'http://localhost:3006'), // TODO: replace this with whatever frontend port ends up being
  waitTimeSeconds: envInt('WAIT_SECONDS', 5),
  cookieKey: envString('COOKIE_KEY', crypto.randomBytes(32).toString('hex')),
  accessTokenExpirySeconds: envInt('ACCESS_TOKEN_EXPIRY_SECONDS', 10 * 60), // Default 10 minutes
  databaseCleanupWorkers: envInt('DATABASE_CLEANUP_WORKERS', 1),
  accessTokenDeletionDays: envInt('ACCESS_TOKEN_DELETION_DAYS', 30)
}
