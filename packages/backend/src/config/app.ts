import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import * as crypto from 'crypto'
import dotenv from 'dotenv'
import * as fs from 'fs'
import { ConnectionOptions } from 'tls'

function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envStringArray(name: string, value: string[]): string[] {
  const envValue = process.env[name]
  return envValue == null ? value : envValue.split(',').map((s) => s.trim())
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

function envFloat(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : +envValue
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
  enableTelemetry: envBool('ENABLE_TELEMETRY', true),
  openTelemetryCollectors: envStringArray('OPEN_TELEMETRY_COLLECTOR_URL', [
    'http://otel-collector-NLB-e3172ff9d2f4bc8a.elb.eu-west-2.amazonaws.com:4317'
  ]),
  openTelemetryExportInterval: envInt('OPEN_TELEMETRY_EXPORT_INTERVAL', 15000),
  telemetryExchangeRatesUrl: envString(
    'TELEMETRY_EXCHANGE_RATES_URL',
    'https://telemetry-exchange-rates.s3.amazonaws.com/exchange-rates-usd.json'
  ),
  telemetryExchangeRatesLifetime: envInt(
    'TELEMETRY_EXCHANGE_RATES_LIFETIME',
    86_400_000
  ),
  telemetryBaseAssetCode: envString('TELEMETRY_BASE_ASSET_CODE', 'USD'),
  adminPort: envInt('ADMIN_PORT', 3001),
  openPaymentsUrl: envString('OPEN_PAYMENTS_URL', 'http://127.0.0.1:3000'),
  openPaymentsPort: envInt('OPEN_PAYMENTS_PORT', 3003),
  connectorPort: envInt('CONNECTOR_PORT', 3002),
  autoPeeringServerPort: envInt('AUTO_PEERING_SERVER_PORT', 3005),
  enableAutoPeering: envBool('ENABLE_AUTO_PEERING', false),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/development'
        ),
  walletAddressUrl: envString(
    'WALLET_ADDRESS_URL',
    'http://127.0.0.1:3001/.well-known/pay'
  ),
  env: envString('NODE_ENV', 'development'),
  trustProxy: envBool('TRUST_PROXY', false),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  redisTls: parseRedisTlsConfig(
    envString('REDIS_TLS_CA_FILE_PATH', ''),
    envString('REDIS_TLS_KEY_FILE_PATH', ''),
    envString('REDIS_TLS_CERT_FILE_PATH', '')
  ),
  ilpAddress: envString('ILP_ADDRESS', 'test.rafiki'),
  ilpConnectorAddress: envString(
    'ILP_CONNECTOR_ADDRESS',
    'http://127.0.0.1:3002'
  ),
  instanceName: envString('INSTANCE_NAME', 'Rafiki'),
  streamSecret: process.env.STREAM_SECRET
    ? Buffer.from(process.env.STREAM_SECRET, 'base64')
    : crypto.randomBytes(32),

  useTigerbeetle: envBool('USE_TIGERBEETLE', false),
  tigerbeetleClusterId: envInt('TIGERBEETLE_CLUSTER_ID', 0),
  tigerbeetleReplicaAddresses: process.env.TIGERBEETLE_REPLICA_ADDRESSES
    ? process.env.TIGERBEETLE_REPLICA_ADDRESSES.split(',')
    : ['3004'],

  exchangeRatesUrl: process.env.EXCHANGE_RATES_URL, // optional
  exchangeRatesLifetime: +(process.env.EXCHANGE_RATES_LIFETIME || 15_000),

  slippage: envFloat('SLIPPAGE', 0.01),
  quoteLifespan: envInt('QUOTE_LIFESPAN', 5 * 60_000), // milliseconds

  walletAddressWorkers: envInt('WALLET_ADDRESS_WORKERS', 1),
  walletAddressWorkerIdle: envInt('WALLET_ADDRESS_WORKER_IDLE', 200), // milliseconds

  authServerGrantUrl: envString(
    'AUTH_SERVER_GRANT_URL',
    'http://127.0.0.1:3006'
  ),
  authServerIntrospectionUrl: envString(
    'AUTH_SERVER_INTROSPECTION_URL',
    'http://127.0.0.1:3007/'
  ),

  outgoingPaymentWorkers: envInt('OUTGOING_PAYMENT_WORKERS', 4),
  outgoingPaymentWorkerIdle: envInt('OUTGOING_PAYMENT_WORKER_IDLE', 200), // milliseconds

  incomingPaymentWorkers: envInt('INCOMING_PAYMENT_WORKERS', 1),
  incomingPaymentWorkerIdle: envInt('INCOMING_PAYMENT_WORKER_IDLE', 200), // milliseconds

  webhookWorkers: envInt('WEBHOOK_WORKERS', 1),
  webhookWorkerIdle: envInt('WEBHOOK_WORKER_IDLE', 200), // milliseconds
  webhookUrl: envString('WEBHOOK_URL', 'http://127.0.0.1:4001/webhook'),
  webhookTimeout: envInt('WEBHOOK_TIMEOUT', 2000), // milliseconds

  withdrawalThrottleDelay:
    process.env.WITHDRAWAL_THROTTLE_DELAY == null
      ? undefined
      : +process.env.WITHDRAWAL_THROTTLE_DELAY, // optional

  signatureSecret: process.env.SIGNATURE_SECRET, // optional
  signatureVersion: envInt('SIGNATURE_VERSION', 1),

  keyId: envString('KEY_ID', 'rafiki'),
  privateKey: loadOrGenerateKey(envString('PRIVATE_KEY_FILE', '')),

  graphQLIdempotencyKeyLockMs: envInt('GRAPHQL_IDEMPOTENCY_KEY_LOCK_MS', 2000),
  graphQLIdempotencyKeyTtlMs: envInt(
    'GRAPHQL_IDEMPOTENCY_KEY_TTL_MS',
    86400000
  ),
  walletAddressLookupTimeoutMs: envInt(
    'WALLET_ADDRESS_LOOKUP_TIMEOUT_MS',
    1500
  ),
  walletAddressPollingFrequencyMs: envInt(
    'WALLET_ADDRESS_POLLING_FREQUENCY_MS',
    100
  ),
  walletAddressDeactivationPaymentGracePeriodMs: envInt(
    'WALLET_ADDRESS_DEACTIVATION_PAYMENT_GRACE_PERIOD_MS',
    86400000
  ),
  incomingPaymentExpiryMaxMs: envInt(
    'INCOMING_PAYMENT_EXPIRY_MAX_MS',
    2592000000
  ) // 30 days
}

function parseRedisTlsConfig(
  caFile: string,
  keyFile: string,
  certFile: string
): ConnectionOptions | undefined {
  const options: ConnectionOptions = {}

  // self-signed certs.
  if (caFile !== '') {
    options.ca = fs.readFileSync(caFile)
    options.rejectUnauthorized = false
  }

  if (certFile !== '') {
    options.cert = fs.readFileSync(certFile)
  }

  if (keyFile !== '') {
    options.key = fs.readFileSync(keyFile)
  }

  return Object.keys(options).length > 0 ? options : undefined
}
