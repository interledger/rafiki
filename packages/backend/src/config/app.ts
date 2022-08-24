import * as crypto from 'crypto'
import { readFileSync } from 'fs'
import { ConnectionOptions } from 'tls'

function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

function envFloat(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : +envValue
}

// function envBool(name: string, value: boolean): boolean {
//   const envValue = process.env[name]
//   return envValue == null ? value : Boolean(envValue)
// }

export type IAppConfig = typeof Config

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),

  // adminHost is for the admin API.
  adminHost: envString('ADMIN_HOST', '127.0.0.1:3001'),
  openPaymentsHost: envString('OPEN_PAYMENTS_HOST', '127.0.0.1:3003'),
  connectorPort: parsePort(envString('CONNECTOR_HOST', '127.0.0.1:3002')),

  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/development'
        ),
  env: envString('NODE_ENV', 'development'),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  redisTls: parseRedisTlsConfig(
    envString('REDIS_TLS_CA_FILE_PATH', ''),
    envString('REDIS_TLS_KEY_FILE_PATH', ''),
    envString('REDIS_TLS_CERT_FILE_PATH', '')
  ),
  coilApiGrpcUrl: envString('COIL_API_GRPC_URL', 'localhost:6000'),
  nonceRedisKey: envString('NONCE_REDIS_KEY', 'nonceToProject'),
  adminKey: envString('ADMIN_KEY', 'qwertyuiop1234567890'),
  sessionLength: envInt('SESSION_LENGTH', 30), // in minutes

  ilpAddress: envString('ILP_ADDRESS', 'test.rafiki'),
  streamSecret: process.env.STREAM_SECRET
    ? Buffer.from(process.env.STREAM_SECRET, 'base64')
    : crypto.randomBytes(32),

  tigerbeetleClusterId: envInt('TIGERBEETLE_CLUSTER_ID', 0),
  tigerbeetleReplicaAddresses: process.env.TIGERBEETLE_REPLICA_ADDRESSES
    ? JSON.parse(process.env.TIGERBEETLE_REPLICA_ADDRESSES)
    : ['3004'],

  pricesUrl: process.env.PRICES_URL, // optional
  pricesLifetime: +(process.env.PRICES_LIFETIME || 15_000),

  slippage: envFloat('SLIPPAGE', 0.01),
  quoteLifespan: envInt('QUOTE_LIFESPAN', 5 * 60_000), // milliseconds

  paymentPointerWorkers: envInt('PAYMENT_POINTER_WORKERS', 1),
  paymentPointerWorkerIdle: envInt('PAYMENT_POINTER_WORKER_IDLE', 200), // milliseconds

  authServerGrantUrl: envString(
    'AUTH_SERVER_GRANT_URL',
    'http://127.0.0.1:3006'
  ),
  authServerIntrospectionUrl: envString(
    'AUTH_SERVER_INTROSPECTION_URL',
    'http://127.0.0.1:3007/introspect'
  ),

  outgoingPaymentWorkers: envInt('OUTGOING_PAYMENT_WORKERS', 4),
  outgoingPaymentWorkerIdle: envInt('OUTGOING_PAYMENT_WORKER_IDLE', 200), // milliseconds

  incomingPaymentWorkers: envInt('INCOMING_PAYMENT_WORKERS', 1),
  incomingPaymentWorkerIdle: envInt('INCOMING_PAYMENT_WORKER_IDLE', 200), // milliseconds

  quoteUrl: envString('QUOTE_URL', 'http://127.0.0.1:4001/quote'),

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

  openPaymentsSpec: envString(
    'OPEN_PAYMENTS_SPEC',
    'https://raw.githubusercontent.com/interledger/open-payments/8dda04b6a0133a2c8bca89345001340f182297ba/open-api-spec.yaml'
  ),
  authServerSpec: envString(
    'AUTH_SERVER_SPEC',
    'https://raw.githubusercontent.com/interledger/open-payments/ab840c8ff904a4b8c45d94ac23f5518a79a67686/auth-server-open-api-spec.yaml'
  ),

  /** Frontend **/
  frontendUrl: envString('FRONTEND_URL', 'http://localhost:3000')
}

function parseRedisTlsConfig(
  caFile: string,
  keyFile: string,
  certFile: string
): ConnectionOptions | undefined {
  const options: ConnectionOptions = {}

  // self-signed certs.
  if (caFile !== '') {
    options.ca = readFileSync(caFile)
    options.rejectUnauthorized = false
  }

  if (certFile !== '') {
    options.cert = readFileSync(certFile)
  }

  if (keyFile !== '') {
    options.key = readFileSync(keyFile)
  }

  return Object.keys(options).length > 0 ? options : undefined
}

export function parsePort(host: string): number {
  const port = host.split(':')[1]
  if (!port) {
    return 0
  }
}

export function parseHostname(host: string): string {
  const hostname = host.split(':')[0]
  if (!hostname) {
    return ''
  }
  return hostname
}
