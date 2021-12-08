import * as crypto from 'crypto'

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
  // publicHost is for open payments URLs.
  publicHost: envString('PUBLIC_HOST', 'http://127.0.0.1:3001'),
  port: envInt('PORT', 3001),
  connectorPort: envInt('CONNECTOR_PORT', 3002),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/development'
        ),
  env: envString('NODE_ENV', 'development'),
  redisUrl: envString('REDIS_URL', 'redis://127.0.0.1:6379'),
  coilApiGrpcUrl: envString('COIL_API_GRPC_URL', 'localhost:6000'),
  nonceRedisKey: envString('NONCE_REDIS_KEY', 'nonceToProject'),
  adminKey: envString('ADMIN_KEY', 'qwertyuiop1234567890'),
  sessionLength: envInt('SESSION_LENGTH', 30), // in minutes

  ilpAddress: envString('ILP_ADDRESS', 'test.rafiki'),
  streamSecret: process.env.STREAM_SECRET
    ? Buffer.from(process.env.STREAM_SECRET, 'base64')
    : crypto.randomBytes(32),

  tigerbeetleClusterId: envInt('TIGERBEETLE_CLUSTER_ID', 1),
  tigerbeetleReplicaAddresses: process.env.TIGERBEETLE_REPLICA_ADDRESSES
    ? JSON.parse(process.env.TIGERBEETLE_REPLICA_ADDRESSES)
    : ['3004'],

  pricesUrl: process.env.PRICES_URL, // optional
  pricesLifetime: +(process.env.PRICES_LIFETIME || 15_000),

  slippage: envFloat('SLIPPAGE', 0.01),
  quoteLifespan: envInt('QUOTE_LIFESPAN', 5 * 60_000), // milliseconds

  outgoingPaymentWorkers: envInt('OUTGOING_PAYMENT_WORKERS', 4),
  outgoingPaymentWorkerIdle: envInt('OUTGOING_PAYMENT_WORKER_IDLE', 200), // milliseconds

  deactivateInvoiceWorkers: envInt('DEACTIVATE_INVOICE_WORKERS', 1),
  deactivateInvoiceWorkerIdle: envInt('DEACTIVATE_INVOICE_WORKER_IDLE', 200), // milliseconds

  webhookUrl: envString('WEBHOOK_URL', 'http://127.0.0.1:4001/webhook'),
  webhookSecret: process.env.WEBHOOK_SECRET, // optional
  signatureVersion: envInt('SIGNATURE_VERSION', 1),

  /** Frontend **/
  frontendUrl: envString('FRONTEND_URL', 'http://localhost:3000')
}
