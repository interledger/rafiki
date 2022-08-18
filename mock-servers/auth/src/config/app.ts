import * as crypto from 'crypto'

function envString(name: string, value: string): string {
  const envValue = process.env[name]
  return envValue == null ? value : envValue
}

function envInt(name: string, value: number): number {
  const envValue = process.env[name]
  return envValue == null ? value : parseInt(envValue)
}

export type IAppConfig = typeof Config

export const Config = {
  logLevel: envString('LOG_LEVEL', 'info'),
  port: envInt('PORT', 1337),
  env: envString('NODE_ENV', 'development'),
  waitTimeSeconds: envInt('WAIT_SECONDS', 5),
  cookieKey: envString('COOKIE_KEY', crypto.randomBytes(32).toString('hex'))
}
