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

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  databaseUrl: envString(
    'DATABASE_URL',
    'postgresql://postgres:password@localhost:6543/development'
  ),
  dbSchema: undefined as string | undefined,
  enableManualMigrations: envBool('ENABLE_MANUAL_MIGRATIONS', false),
  trustProxy: envBool('TRUST_PROXY', false),
  env: envString('NODE_ENV', 'development'),
  cardServicePort: envInt('CARD_SERVICE_PORT', 3007)
}

export type IAppConfig = typeof Config
