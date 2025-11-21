import dotenv from 'dotenv'

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
  env: envString('NODE_ENV', 'development'),
  port: envInt('PORT', 3008),
  trustProxy: envBool('TRUST_PROXY', false),
  tenantId: envString('TENANT_ID'),
  tenantSecret: envString('TENANT_SECRET'),
  tenantSignatureVersion: envInt('TENANT_SIGNATURE_VERSION', 1),
  graphqlUrl: envString('GRAPHQL_URL'),
  webhookSignatureVersion: envInt('WEBHOOK_SIGNATURE_VERSION', 1),
  webhookSignatureSecret: envString('WEBHOOK_SIGNATURE_SECRET'),
  webhookTimeoutMs: envInt('WEBHOOK_TIMEOUT_MS', 30000),
  incomingPaymentExpiryMs: envInt('INCOMING_PAYMENT_EXPIRY_MS', 10000),
  useHttp: envBool('USE_HTTP', false)
}
