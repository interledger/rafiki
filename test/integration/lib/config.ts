import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import type { Config } from 'mock-account-servicing-lib'

import { resolve } from 'path'

const C9_KEY_PATH = resolve(
  __dirname,
  '../testenv/cloud-nine-wallet/private-key.pem'
)
const C9_SEED_PATH = resolve(__dirname, '../testenv/cloud-nine-wallet/seed.yml')

export const c9Config: Config = {
  seed: parse(readFileSync(C9_SEED_PATH).toString('utf8')),
  key: loadOrGenerateKey(C9_KEY_PATH),
  publicHost: 'https://cloud-nine-wallet-backend-test',
  testnetAutoPeerUrl: '',
  authServerDomain: 'http://localhost:3006',
  graphqlUrl: 'http://localhost:3001/graphql'
} as const

const HLB_KEY_PATH = resolve(
  __dirname,
  '../testenv/happy-life-bank/private-key.pem'
)
const HLB_SEED_PATH = resolve(__dirname, '../testenv/happy-life-bank/seed.yml')

export const hlbConfig: Config = {
  seed: parse(readFileSync(HLB_SEED_PATH).toString('utf8')),
  key: loadOrGenerateKey(HLB_KEY_PATH),
  publicHost: 'https://happy-life-bank-backend-test',
  testnetAutoPeerUrl: '',
  authServerDomain: 'http://localhost:3006',
  graphqlUrl: 'http://localhost:4001/graphql'
} as const
