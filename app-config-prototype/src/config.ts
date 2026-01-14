import dotenv from 'dotenv'
import { ZodError } from 'zod'
import { AppConfigSchema, AppConfig, envVarMapping, secretFields } from './schema.js'

export interface LoadConfigOptions {
  /** Path to .env file */
  envFile?: string
  /** If true, throw on validation errors. If false, return errors. */
  throwOnError?: boolean
}

export interface LoadConfigSuccess {
  success: true
  config: AppConfig
}

export interface LoadConfigFailure {
  success: false
  errors: Array<{
    field: string
    envVar: string
    message: string
  }>
}

export type LoadConfigResult = LoadConfigSuccess | LoadConfigFailure

/**
 * Build config input object from environment variables using the mapping.
 */
function buildConfigInput(): Record<string, unknown> {
  const input: Record<string, unknown> = {}

  for (const [field, envVar] of Object.entries(envVarMapping)) {
    const value = process.env[envVar]
    if (value !== undefined) {
      input[field] = value
    }
  }

  return input
}

/**
 * Format Zod errors into user-friendly messages with env var names.
 */
function formatErrors(error: ZodError): LoadConfigFailure['errors'] {
  return error.errors.map((err) => {
    const field = err.path.join('.')
    const envVar = envVarMapping[field as keyof AppConfig] || field.toUpperCase()

    return {
      field,
      envVar,
      message: err.message
    }
  })
}

/**
 * Load and validate configuration from environment variables.
 *
 * @param options - Configuration options
 * @returns Validated config or error details
 */
export function loadConfig(options: LoadConfigOptions = {}): LoadConfigResult {
  const { envFile, throwOnError = false } = options

  // Load .env file if specified
  if (envFile) {
    dotenv.config({ path: envFile })
  } else {
    dotenv.config()
  }

  const input = buildConfigInput()
  const result = AppConfigSchema.safeParse(input)

  if (result.success) {
    return {
      success: true,
      config: result.data
    }
  }

  const errors = formatErrors(result.error)

  if (throwOnError) {
    const errorMessages = errors
      .map((e) => `  - ${e.envVar}: ${e.message}`)
      .join('\n')
    throw new Error(`Config validation failed:\n${errorMessages}`)
  }

  return {
    success: false,
    errors
  }
}

/**
 * Redact sensitive fields from config for safe logging.
 */
export function redactConfig(config: AppConfig): Record<string, unknown> {
  const redacted: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(config)) {
    if (secretFields.has(key as keyof AppConfig)) {
      redacted[key] = '[REDACTED]'
    } else {
      redacted[key] = value
    }
  }

  return redacted
}
