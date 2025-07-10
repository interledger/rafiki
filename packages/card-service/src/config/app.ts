import { ConnectionOptions } from 'tls'
import * as fs from 'fs'

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

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:6543/development'
  ),
  dbSchema: undefined as string | undefined,
  enableManualMigrations: envBool('ENABLE_MANUAL_MIGRATIONS', false),
  trustProxy: envBool('TRUST_PROXY', false),
  env: envString('NODE_ENV', 'development'),
  cardServicePort: envInt('CARD_SERVICE_PORT', 3007),
  cardServiceUrl: envString(
    'CARD_SERVICE_URL',
    'http://localhost:3007'),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  redisTls: parseRedisTlsConfig(
    process.env.REDIS_TLS_CA_FILE_PATH,
    process.env.REDIS_TLS_KEY_FILE_PATH,
    process.env.REDIS_TLS_CERT_FILE_PATH
  )
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

export type IAppConfig = typeof Config
