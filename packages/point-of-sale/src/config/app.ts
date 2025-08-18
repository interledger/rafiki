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

export type IAppConfig = typeof Config

dotenv.config({
  path: process.env.ENV_FILE || '.env'
})

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/development'
        ),
  env: envString('NODE_ENV', 'development'),
  port: envInt('PORT', 3008),
  trustProxy: envBool('TRUST_PROXY', false),
  enableManualMigrations: envBool('ENABLE_MANUAl_MIGRATIONS', false),
  dbSchema: undefined as string | undefined,
  tenantId: envString('TENANT_ID'),
  tenantSecret: envString('TENANT_SECRET'),
  tenantSignatureVersion: envInt('TENANT_SIGNATURE_VERSION', 1),
  graphqlUrl: envString('GRAPHQL_URL'),
  webhookSignatureVersion: envInt('WEBHOOK_SIGNATURE_VERSION', 1),
  webhookSignatureSecret: envString('WEBHOOK_SIGNATURE_SECRET'),
  webhookTimeoutMs: envInt('WEBHOOK_TIMEOUNT_MS', 30000)
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
