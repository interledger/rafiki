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
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:5432/development'
  ),
  env: envString('NODE_ENV', 'development'),
  port: envInt('PORT', 3008),
  trustProxy: envBool('TRUST_PROXY', false),
  enableManualMigrations: envBool('ENABLE_MANUAl_MIGRATIONS', false),
  dbSchema: undefined as string | undefined
}
