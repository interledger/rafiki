import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import type { Config } from 'mock-account-servicing-lib'

import { resolve } from 'path'

export type TestConfig = Config & {
  graphqlUrl: string
}

export const c9Config: TestConfig = {
  seed: parse(
    readFileSync(
      resolve(__dirname, '../seed.cloud-nine-wallet-test.yml')
    ).toString('utf8')
  ),
  key: loadOrGenerateKey(
    resolve(__dirname, '../private-key.cloud-nine-wallet-test.pem')
  ),
  publicHost: 'https://cloud-nine-wallet-backend-test',
  testnetAutoPeerUrl: '',
  authServerDomain: 'http://localhost:3006',
  graphqlUrl: 'http://localhost:3001/graphql'
} as const

export const hlbConfig: TestConfig = {
  seed: parse(
    readFileSync(
      resolve(__dirname, '../seed.happy-life-bank-test.yml')
    ).toString('utf8')
  ),
  key: loadOrGenerateKey(
    resolve(__dirname, '../private-key.happy-life-bank-test.pem')
  ),
  publicHost: 'https://happy-life-bank-backend-test',
  testnetAutoPeerUrl: '',
  authServerDomain: 'http://localhost:3006',
  graphqlUrl: 'http://localhost:4001/graphql'
} as const
