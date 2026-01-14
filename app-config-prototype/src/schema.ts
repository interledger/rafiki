import { z } from 'zod'

/**
 * Application configuration schema.
 *
 * Each field includes:
 * - Type validation
 * - Description (used for doc generation)
 * - Default value (where appropriate)
 * - Metadata for special handling (e.g., secrets)
 */
export const AppConfigSchema = z.object({
  env: z
    .enum(['development', 'test', 'production'])
    .default('development')
    .describe('Current runtime environment'),

  logLevel: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info')
    .describe('Logging verbosity level'),

  adminPort: z
    .coerce.number()
    .int()
    .min(1)
    .max(65535)
    .default(3001)
    .describe('Port for the Admin GraphQL API'),

  adminApiSecret: z
    .string()
    .min(1)
    .describe('Secret used for authenticating admin API calls'),

  databaseUrl: z
    .string()
    .url()
    .describe('PostgreSQL connection URL'),

  redisUrl: z
    .string()
    .url()
    .default('redis://127.0.0.1:6379')
    .describe('Redis connection URL for caching and sessions'),

  enableAutoPeering: z
    .coerce.boolean()
    .default(false)
    .describe('Enable automatic peering between Rafiki nodes'),

  enableTelemetry: z
    .coerce.boolean()
    .default(false)
    .describe('Enable OpenTelemetry metrics collection'),

  webhookUrl: z
    .string()
    .url()
    .describe('URL to receive webhook notifications for payment events'),

  webhookTimeout: z
    .coerce.number()
    .int()
    .min(100)
    .max(30000)
    .default(2000)
    .describe('Timeout in milliseconds for webhook requests'),

  cardServiceUrl: z
    .string()
    .url()
    .optional()
    .describe('Optional URL for card service integration'),

  privateKeyFile: z
    .string()
    .min(1)
    .describe('Path to the private key file for signing requests'),

  slippage: z
    .coerce.number()
    .min(0)
    .max(1)
    .default(0.01)
    .describe('Maximum allowed exchange rate slippage (0-1)')
})

export type AppConfig = z.infer<typeof AppConfigSchema>

/**
 * Mapping from schema keys to environment variable names.
 * This allows the schema to use camelCase while env vars use SCREAMING_SNAKE_CASE.
 */
export const envVarMapping: Record<keyof AppConfig, string> = {
  env: 'NODE_ENV',
  logLevel: 'LOG_LEVEL',
  adminPort: 'ADMIN_PORT',
  adminApiSecret: 'ADMIN_API_SECRET',
  databaseUrl: 'DATABASE_URL',
  redisUrl: 'REDIS_URL',
  enableAutoPeering: 'ENABLE_AUTO_PEERING',
  enableTelemetry: 'ENABLE_TELEMETRY',
  webhookUrl: 'WEBHOOK_URL',
  webhookTimeout: 'WEBHOOK_TIMEOUT',
  cardServiceUrl: 'CARD_SERVICE_URL',
  privateKeyFile: 'PRIVATE_KEY_FILE',
  slippage: 'SLIPPAGE'
}

/**
 * Fields that contain sensitive values (should be redacted in logs/output).
 */
export const secretFields: Set<keyof AppConfig> = new Set([
  'adminApiSecret',
  'databaseUrl',
  'privateKeyFile'
])
