import dotenv from 'dotenv'
import * as fs from 'fs'
import { ConnectionOptions } from 'tls'

function envString(name: string, defaultValue?: string): string {
  const envValue = process.env[name]

  if (envValue) return envValue
  if (defaultValue) return defaultValue

  throw new Error(`Environment variable ${name} must be set.`)
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

function envBool(name: string, value: boolean): boolean {
  const envValue = process.env[name]
  return envValue == null ? value : envValue === 'true'
}
function envEnum<T extends string>(
  name: string,
  allowedValues: T[],
  defaultValue: T | undefined
): T | undefined {
  const envValue = process.env[name]
  if (envValue && allowedValues.includes(envValue as T)) {
    return envValue as T
  }
  return defaultValue
}
export type IAppConfig = typeof Config

dotenv.config({
  path: process.env.ENV_FILE || '.env'
})

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  adminPort: envInt('ADMIN_PORT', 3003),
  authPort: envInt('AUTH_PORT', 3006),
  interactionPort: envInt('INTERACTION_PORT', 3009),
  introspectionPort: envInt('INTROSPECTION_PORT', 3007),
  serviceAPIPort: envInt('SERVICE_API_PORT', 3011),
  env: envString('NODE_ENV', 'development'),
  trustProxy: envBool('TRUST_PROXY', false),
  enableManualMigrations: envBool('ENABLE_MANUAL_MIGRATIONS', false),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.AUTH_DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'AUTH_DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/auth_development'
        ),
  identityServerUrl: envString('IDENTITY_SERVER_URL'),
  identityServerSecret: envString('IDENTITY_SERVER_SECRET'),
  authServerUrl: envString('AUTH_SERVER_URL'),
  adminApiSecret: envString('ADMIN_API_SECRET'),
  adminApiSignatureVersion: envInt('ADMIN_API_SIGNATURE_VERSION', 1),
  adminApiSignatureTtlSeconds: envInt('ADMIN_API_SIGNATURE_TTL_SECONDS', 30),
  waitTimeSeconds: envInt('WAIT_SECONDS', 5),
  cookieKey: envString('COOKIE_KEY'),
  interactionCookieSameSite: envEnum(
    'INTERACTION_COOKIE_SAME_SITE',
    ['lax', 'none'],
    undefined
  ),
  interactionExpirySeconds: envInt('INTERACTION_EXPIRY_SECONDS', 10 * 60), // Default 10 minutes
  accessTokenExpirySeconds: envInt('ACCESS_TOKEN_EXPIRY_SECONDS', 10 * 60), // Default 10 minutes
  databaseCleanupWorkers: envInt('DATABASE_CLEANUP_WORKERS', 1),
  accessTokenDeletionDays: envInt('ACCESS_TOKEN_DELETION_DAYS', 30),
  incomingPaymentInteraction: envBool('INCOMING_PAYMENT_INTERACTION', false),
  quoteInteraction: envBool('QUOTE_INTERACTION', false),
  listAllInteraction: envBool('LIST_ALL_ACCESS_INTERACTION', true),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  redisTls: parseRedisTlsConfig(
    process.env.REDIS_TLS_CA_FILE_PATH,
    process.env.REDIS_TLS_KEY_FILE_PATH,
    process.env.REDIS_TLS_CERT_FILE_PATH
  ),
  operatorTenantId: envString('OPERATOR_TENANT_ID'),
  dbSchema: undefined as string | undefined
}

function parseRedisTlsConfig(
  caFile?: string,
  keyFile?: string,
  certFile?: string
): ConnectionOptions | undefined {
  const options: ConnectionOptions = {}

  // self-signed certs.
  if (caFile) {
    options.ca = fs.readFileSync(caFile)
    options.rejectUnauthorized = false
  }

  if (certFile) {
    options.cert = fs.readFileSync(certFile)
  }

  if (keyFile) {
    options.key = fs.readFileSync(keyFile)
  }

  return Object.keys(options).length > 0 ? options : undefined
}
