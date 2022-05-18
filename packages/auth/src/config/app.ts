function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

// Represented by JSON-stringified arrays in the environment
function envStringArray(name: string, value: string[]): string[] {
  const envValue = process.env[name]
  return envValue == null ? value : JSON.parse(envValue)
}

export type IAppConfig = typeof Config

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 3006),
  env: envString('NODE_ENV', 'development'),
  databaseUrl:
    process.env.NODE_ENV === 'test'
      ? `${process.env.AUTH_DATABASE_URL}_${process.env.JEST_WORKER_ID}`
      : envString(
          'AUTH_DATABASE_URL',
          'postgresql://postgres:password@localhost:5432/auth_development'
        ),
  keyRegistries: envStringArray('KEY_REGISTRIES', [
    'https://openpayments.network'
  ]),
  interactUrl: envString('INTERACT_URL', 'http://localhost:3004/interact'), // TODO: replace this with whatever frontend port ends up being
  domain: envString('DOMAIN', 'http://localhost:3006')
}
