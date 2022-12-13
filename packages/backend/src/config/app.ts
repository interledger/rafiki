import * as crypto from 'crypto'
import * as fs from 'fs'
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

function envBool(name: string, value: boolean): boolean {
  const envValue = process.env[name]
  return envValue == null ? value : envValue === 'true'
}

export type IAppConfig = typeof Config

const TMP_DIR = './tmp'
const PRIVATE_KEY_FILE = `${TMP_DIR}/private-key-${new Date().getTime()}.pem`

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  // publicHost is for open payments URLs.
  publicHost: envString('PUBLIC_HOST', 'http://127.0.0.1:3001'),
  adminPort: envInt('ADMIN_PORT', 3001),
  openPaymentsUrl: envString('OPEN_PAYMENTS_URL', 'http://127.0.0.1:3003'),
  openPaymentsPort: envInt('OPEN_PAYMENTS_PORT', 3003),
  connectorPort: envInt('CONNECTOR_PORT', 3002),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/development'
        ),
  paymentPointerUrl: envString(
    'PAYMENT_POINTER_URL',
    'http://127.0.0.1:3001/.well-known/pay'
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
  devAccessToken: envString('DEV_ACCESS_TOKEN', 'dev-access-token'),

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
  bypassSignatureValidation: envBool('BYPASS_SIGNATURE_VALIDATION', false),

  keyId: envString('KEY_ID', 'rafiki'),
  privateKey: parseOrProvisionKey(envString('PRIVATE_KEY_FILE', undefined)),

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

// exported for testing
export function parseOrProvisionKey(
  keyFile: string | undefined
): crypto.KeyObject {
  if (keyFile) {
    try {
      const key = crypto.createPrivateKey(fs.readFileSync(keyFile))
      const jwk = key.export({ format: 'jwk' })
      if (jwk.crv === 'Ed25519') {
        return key
      } else {
        console.log('Private key is not EdDSA-Ed25519 key. Generating new key.')
      }
    } catch (err) {
      console.log('Private key could not be loaded.')
      throw err
    }
  }
  const keypair = crypto.generateKeyPairSync('ed25519')
  if (!fs.existsSync(TMP_DIR)) {
    fs.mkdirSync(TMP_DIR)
  }
  fs.writeFileSync(
    PRIVATE_KEY_FILE,
    keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
  )
  return keypair.privateKey
}
