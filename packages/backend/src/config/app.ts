import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import dotenv from 'dotenv'
import * as fs from 'fs'
import { ConnectionOptions } from 'tls'
import * as crypto from 'crypto'

export type IAppConfig = Config

dotenv.config({
  path: process.env.ENV_FILE || '.env'
})

function parseRedisTlsConfig(
  caFile?: string,
  keyFile?: string,
  certFile?: string
): ConnectionOptions | undefined {
  if (!caFile || !keyFile || !certFile) {
    return undefined
  }

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

type EnvType = 'int' | 'float' | 'boolean' | 'string' | 'string[]'

function convertValue<T>(type: EnvType, value: string): T {
  switch (type) {
    case 'int':
      return parseInt(value, 10) as unknown as T
    case 'float':
      return parseFloat(value) as unknown as T
    case 'boolean':
      return (value === 'true') as unknown as T
    case 'string[]':
      return value.split(',').map((item) => item.trim()) as unknown as T
    case 'string':
    default:
      return value as unknown as T
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DefaultValueFunction<T> = (configInstance: any) => T

interface EnvOptions<T> {
  type: EnvType
  optional?: boolean
  defaultValue?: T | DefaultValueFunction<T>
  transformer?: (value: string) => T
}

function Env<T>(
  variableName: string,
  options: EnvOptions<T> = { type: 'string' }
) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function (target: any, propertyKey: string): void {
    const envValue = process.env[variableName]
    let transformedValue: T | undefined

    if (envValue !== undefined) {
      transformedValue = convertValue<T>(options.type, envValue)
      if (options.transformer) {
        transformedValue = options.transformer(envValue)
      }
    } else if (options.optional) {
      if (typeof options.defaultValue === 'function') {
        Object.defineProperty(target, propertyKey, {
          get() {
            const defaultVal = (
              options.defaultValue as DefaultValueFunction<T>
            )(this)
            return options.transformer
              ? options.transformer(String(defaultVal))
              : defaultVal
          },
          set(value) {
            target[propertyKey] = value
          },
          enumerable: true,
          configurable: true
        })
        return
      } else if (options.defaultValue !== undefined) {
        transformedValue = options.defaultValue
        if (options.transformer) {
          transformedValue = options.transformer(String(options.defaultValue))
        }
      }
    } else {
      throw new Error(
        `Environment variable ${variableName} is mandatory but not provided.`
      )
    }

    if (transformedValue !== undefined) {
      target[propertyKey] = transformedValue
    }
  }
}

export interface IConfig {
  logLevel: string
  enableTelemetry: boolean
  livenet: boolean
  openTelemetryCollectors: string[]
  openTelemetryExportInterval: number
  telemetryExchangeRatesUrl: string
  telemetryExchangeRatesLifetime: number
  adminPort: number
  openPaymentsUrl: string
  openPaymentsPort: number
  connectorPort: number
  autoPeeringServerPort: number
  enableAutoPeering: boolean
  enableManualMigrations: boolean
  databaseUrl: string
  walletAddressUrl: string
  env: string
  trustProxy: boolean
  redisUrl: string
  ilpAddress: string
  ilpConnectorAddress: string
  instanceName: string
  streamSecret: Buffer
  useTigerbeetle: boolean
  tigerbeetleClusterId: number
  tigerbeetleReplicaAddresses: string[]
  exchangeRatesUrl: string
  exchangeRatesLifetime: number
  slippage: number
  quoteLifespan: number
  walletAddressWorkers: number
  walletAddressWorkerIdle: number
  authServerGrantUrl: string
  authServerIntrospectionUrl: string
  outgoingPaymentWorkers: number
  outgoingPaymentWorkerIdle: number
  incomingPaymentWorkers: number
  incomingPaymentWorkerIdle: number
  webhookWorkers: number
  webhookWorkerIdle: number
  webhookUrl: string
  webhookTimeout: number
  webhookMaxRetry: number
  withdrawalThrottleDelay: number
  signatureSecret: string
  signatureVersion: number
  apiSecret: string
  apiSignatureVersion: number
  keyId: string | undefined
  privateKey: crypto.KeyObject
  graphQLIdempotencyKeyLockMs: number
  graphQLIdempotencyKeyTtlMs: number
  walletAddressLookupTimeoutMs: number
  walletAddressPollingFrequencyMs: number
  walletAddressDeactivationPaymentGracePeriodMs: number
  incomingPaymentExpiryMaxMs: number
  spspEnabled: boolean
}

class Config implements IConfig {
  @Env('LOG_LEVEL', { type: 'string', optional: true, defaultValue: 'info' })
  public logLevel!: string

  @Env('ENABLE_TELEMETRY', {
    type: 'boolean',
    optional: true,
    defaultValue: false
  })
  public enableTelemetry!: boolean

  @Env('LIVENET', { type: 'boolean', optional: true, defaultValue: false })
  public livenet!: boolean

  @Env('OPEN_TELEMETRY_COLLECTOR_URLS', {
    type: 'string[]',
    optional: true,
    defaultValue: (config: Config) => {
      if (config.livenet) {
        return [
          'http://livenet-otel-collector-NLB-f7992547e797f23d.elb.eu-west-2.amazonaws.com:4317'
        ]
      }
      return [
        'http://otel-collector-NLB-e3172ff9d2f4bc8a.elb.eu-west-2.amazonaws.com:4317'
      ]
    }
  })
  public openTelemetryCollectors!: string[]

  @Env('OPEN_TELEMETRY_EXPORT_INTERVAL', {
    type: 'int',
    optional: true,
    defaultValue: 15000
  })
  public openTelemetryExportInterval!: number

  @Env('TELEMETRY_EXCHANGE_RATES_URL', {
    type: 'string',
    optional: true,
    defaultValue:
      'https://telemetry-exchange-rates.s3.amazonaws.com/exchange-rates-usd.json'
  })
  public telemetryExchangeRatesUrl!: string

  @Env('TELEMETRY_EXCHANGE_RATES_LIFETIME', {
    type: 'int',
    optional: true,
    defaultValue: 86_400_000
  })
  public telemetryExchangeRatesLifetime!: number

  @Env('ADMIN_PORT', { type: 'int', optional: true, defaultValue: 3001 })
  public adminPort!: number

  @Env('OPEN_PAYMENTS_URL', { type: 'string' })
  public openPaymentsUrl!: string

  @Env('OPEN_PAYMENTS_PORT', {
    type: 'int',
    optional: true,
    defaultValue: 3003
  })
  public openPaymentsPort!: number

  @Env<string>('CONNECTOR_PORT', {
    type: 'string',
    optional: true,
    defaultValue: '3002'
  })
  public connectorPort!: number

  @Env('AUTO_PEERING_SERVER_PORT', {
    type: 'int',
    optional: true,
    defaultValue: 3005
  })
  public autoPeeringServerPort!: number

  @Env('ENABLE_AUTO_PEERING', {
    type: 'boolean',
    optional: true,
    defaultValue: false
  })
  public enableAutoPeering!: boolean

  @Env('ENABLE_MANUAL_MIGRATIONS', {
    type: 'boolean',
    optional: true,
    defaultValue: false
  })
  public enableManualMigrations!: boolean

  @Env('DATABASE_URL', { type: 'string' })
  public databaseUrl!: string

  @Env('WALLET_ADDRESS_URL', { type: 'string' })
  public walletAddressUrl!: string

  @Env('NODE_ENV', {
    type: 'string',
    optional: true,
    defaultValue: 'development'
  })
  public env!: string

  @Env('TRUST_PROXY', { type: 'boolean', optional: true, defaultValue: false })
  public trustProxy!: boolean

  @Env('REDIS_URL', { type: 'string' })
  public redisUrl!: string

  @Env('REDIS_TLS_CA_FILE_PATH', { type: 'string', optional: true })
  public redisTlsCaFilePath!: string

  @Env('REDIS_TLS_KEY_FILE_PATH', { type: 'string', optional: true })
  public redisTlsKeyFilePath!: string

  @Env('REDIS_TLS_CERT_FILE_PATH', { type: 'string', optional: true })
  public redisTlsCertFilePath!: string

  @Env('REDIS_TLS', {
    type: 'string',
    optional: true,
    defaultValue: (c: Config) => {
      return parseRedisTlsConfig(
        c.redisTlsCaFilePath,
        c.redisTlsKeyFilePath,
        c.redisTlsCertFilePath
      )
    }
  })
  public redisTls!: ConnectionOptions

  @Env('ILP_ADDRESS', { type: 'string' })
  public ilpAddress!: string

  @Env('ILP_CONNECTOR_ADDRESS', { type: 'string' })
  public ilpConnectorAddress!: string

  @Env('INSTANCE_NAME', { type: 'string', optional: true })
  public instanceName!: string

  // Add support for transforming
  @Env('STREAM_SECRET', {
    type: 'string',
    transformer: (value: string) => {
      return Buffer.from(value, 'base64')
    }
  })
  public streamSecret!: Buffer

  @Env('USE_TIGERBEETLE', {
    type: 'boolean',
    optional: true,
    defaultValue: true
  })
  public useTigerbeetle!: boolean

  @Env('TIGERBEETLE_CLUSTER_ID', {
    type: 'int',
    optional: true,
    defaultValue: 0
  })
  public tigerbeetleClusterId!: number

  @Env('TIGERBEETLE_REPLICA_ADDRESSES', {
    type: 'string[]',
    optional: true,
    defaultValue: ['3004']
  })
  public tigerbeetleReplicaAddresses!: string[]

  @Env('EXCHANGE_RATES_URL', { type: 'string' })
  public exchangeRatesUrl!: string

  @Env('EXCHANGE_RATES_LIFETIME', {
    type: 'int',
    optional: true,
    defaultValue: 15_000
  })
  public exchangeRatesLifetime!: number

  @Env('SLIPPAGE', { type: 'float', optional: true, defaultValue: 0.01 })
  public slippage!: number

  @Env('QUOTE_LIFESPAN', {
    type: 'int',
    optional: true,
    defaultValue: 5 * 60_000
  })
  public quoteLifespan!: number

  @Env('WALLET_ADDRESS_WORKERS', {
    type: 'int',
    optional: true,
    defaultValue: 1
  })
  public walletAddressWorkers!: number

  @Env('WALLET_ADDRESS_WORKER_IDLE', {
    type: 'int',
    optional: true,
    defaultValue: 200
  })
  public walletAddressWorkerIdle!: number

  @Env('AUTH_SERVER_GRANT_URL', { type: 'string' })
  public authServerGrantUrl!: string

  @Env('AUTH_SERVER_INTROSPECTION_URL', { type: 'string' })
  public authServerIntrospectionUrl!: string

  @Env('OUTGOING_PAYMENT_WORKERS', {
    type: 'int',
    optional: true,
    defaultValue: 4
  })
  public outgoingPaymentWorkers!: number

  @Env('OUTGOING_PAYMENT_WORKER_IDLE', {
    type: 'int',
    optional: true,
    defaultValue: 200
  }) //milliseconds
  public outgoingPaymentWorkerIdle!: number

  @Env('INCOMING_PAYMENT_WORKERS', {
    type: 'int',
    optional: true,
    defaultValue: 1
  })
  public incomingPaymentWorkers!: number

  @Env('INCOMING_PAYMENT_WORKER_IDLE', {
    type: 'int',
    optional: true,
    defaultValue: 200
  }) //milliseconds
  public incomingPaymentWorkerIdle!: number

  @Env('WEBHOOK_WORKERS', { type: 'int', optional: true, defaultValue: 1 })
  public webhookWorkers!: number

  @Env('WEBHOOK_WORKER_IDLE', {
    type: 'int',
    optional: true,
    defaultValue: 200
  })
  public webhookWorkerIdle!: number

  @Env('WEBHOOK_URL', { type: 'string' })
  public webhookUrl!: string

  @Env('WEBHOOK_TIMEOUT', { type: 'int', optional: true, defaultValue: 2000 }) //milliseconds
  public webhookTimeout!: number

  @Env('WEBHOOK_MAX_RETRY', { type: 'int', optional: true, defaultValue: 10 })
  public webhookMaxRetry!: number

  @Env('WITHDRAWAL_THROTTLE_DELAY', { type: 'int', optional: true })
  public withdrawalThrottleDelay!: number

  @Env('SIGNATURE_SECRET', { type: 'string' })
  public signatureSecret!: string

  @Env('SIGNATURE_VERSION', { type: 'int', optional: true, defaultValue: 1 })
  public signatureVersion!: number

  @Env('API_SECRET', { type: 'string', optional: true })
  public apiSecret!: string

  @Env('API_SIGNATURE_VERSION', {
    type: 'int',
    optional: true,
    defaultValue: 1
  })
  public apiSignatureVersion!: number

  @Env('KEY_ID', { type: 'string', optional: true })
  public keyId!: string

  @Env('PRIVATE_KEY_FILE', {
    type: 'string',
    optional: true,
    transformer(value: string) {
      return loadOrGenerateKey(value)
    }
  })
  public privateKey!: crypto.KeyObject

  @Env('GRAPHQL_IDEMPOTENCY_KEY_LOCK_MS', {
    type: 'int',
    optional: true,
    defaultValue: 2000
  })
  public graphQLIdempotencyKeyLockMs!: number

  @Env('GRAPHQL_IDEMPOTENCY_KEY_TTL_MS', {
    type: 'int',
    optional: true,
    defaultValue: 86400000
  })
  public graphQLIdempotencyKeyTtlMs!: number

  @Env('WALLET_ADDRESS_LOOKUP_TIMEOUT_MS', {
    type: 'int',
    optional: true,
    defaultValue: 1500
  })
  public walletAddressLookupTimeoutMs!: number

  @Env('WALLET_ADDRESS_POLLING_FREQUENCY_MS', {
    type: 'int',
    optional: true,
    defaultValue: 100
  })
  public walletAddressPollingFrequencyMs!: number

  @Env('WALLET_ADDRESS_DEACTIVATION_PAYMENT_GRACE_PERIOD_MS', {
    type: 'int',
    optional: true,
    defaultValue: 86400000
  })
  public walletAddressDeactivationPaymentGracePeriodMs!: number

  @Env('INCOMING_PAYMENT_EXPIRY_MAX_MS', {
    type: 'int',
    optional: true,
    defaultValue: 2592000000
  })
  public incomingPaymentExpiryMaxMs!: number

  @Env('ENABLE_SPSP', { type: 'boolean', optional: true, defaultValue: true })
  public spspEnabled!: boolean

  private static _instance: Config

  private constructor() {}

  public static getInstance() {
    if (!Config._instance) {
      Config._instance = new Config()
    }

    return Config._instance
  }
}

const configInstance = Config.getInstance()
export { configInstance as Config }
