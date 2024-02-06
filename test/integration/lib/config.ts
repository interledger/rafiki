import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import type { Config } from 'mock-account-servicing-lib'
import { parse as envParse } from 'dotenv'

import { resolve } from 'path'

export type TestConfig = Config & {
  webhookServerPort: number
  walletAddressUrl: string
  keyId: string
}

type EnvConfig = {
  OPEN_PAYMENTS_URL: string
  AUTH_SERVER_DOMAIN: string
  WEBHOOK_SERVER_PORT: string
  WALLET_ADDRESS_URL: string
  KEY_ID: string
}
const REQUIRED_KEYS: (keyof EnvConfig)[] = [
  'OPEN_PAYMENTS_URL',
  'AUTH_SERVER_DOMAIN',
  'WEBHOOK_SERVER_PORT',
  'WALLET_ADDRESS_URL',
  'KEY_ID'
]

const loadEnv = (filePath: string): EnvConfig => {
  const fileContent = readFileSync(filePath)
  const envVars = envParse(fileContent)

  const missingKeys: string[] = []
  REQUIRED_KEYS.forEach((key) => {
    if (!envVars[key]) {
      missingKeys.push(key)
    }
  })

  if (missingKeys.length > 0) {
    const errorMessage = `Missing required environment variable(s): ${missingKeys.join(', ')}`
    throw new Error(errorMessage)
  }

  return envVars as EnvConfig
}

type ConfigOptions = {
  graphqlUrl: string
}

const createConfig = (name: string, opts: ConfigOptions): TestConfig => {
  const keyPath = resolve(__dirname, `../testenv/${name}/private-key.pem`)
  const seedPath = resolve(__dirname, `../testenv/${name}/seed.yml`)
  const env = loadEnv(resolve(__dirname, `../testenv/${name}/.env`))

  return {
    seed: parse(readFileSync(seedPath).toString('utf8')),
    key: loadOrGenerateKey(keyPath),
    publicHost: env.OPEN_PAYMENTS_URL,
    testnetAutoPeerUrl: '',
    authServerDomain: env.AUTH_SERVER_DOMAIN,
    webhookServerPort: parseInt(env.WEBHOOK_SERVER_PORT),
    walletAddressUrl: env.WALLET_ADDRESS_URL,
    keyId: env.KEY_ID,
    ...opts
  }
}

export const C9_CONFIG: TestConfig = createConfig('cloud-nine-wallet', {
  graphqlUrl: 'http://localhost:3001/graphql'
})
export const HLB_CONFIG: TestConfig = createConfig('happy-life-bank', {
  graphqlUrl: 'http://localhost:4001/graphql'
})
