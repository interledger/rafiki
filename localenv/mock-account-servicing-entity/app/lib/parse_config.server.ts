import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { loadOrGenerateKey } from '@interledger/http-signature-utils'
import type { Config } from 'mock-account-service-lib'

if (!process.env.OPEN_PAYMENTS_URL) {
  throw new Error('Environment variable OPEN_PAYMENTS_URL is required')
}

if (!process.env.GRAPHQL_URL) {
  throw new Error('Environment variable GRAPHQL_URL is required')
}

if (!process.env.IDP_SECRET) {
  throw new Error('Environment variable IDP_SECRET is required')
}

if (!process.env.OPERATOR_TENANT_ID) {
  throw new Error('Environment variable OPERATOR_TENANT_ID is required')
}

export const CONFIG: Config = {
  seed: parse(
    readFileSync(
      process.env.SEED_FILE_LOCATION || `./seed.example.yml`
    ).toString('utf8')
  ),
  key: loadOrGenerateKey(process.env.KEY_FILE),
  publicHost: process.env.OPEN_PAYMENTS_URL,
  testnetAutoPeerUrl: process.env.TESTNET_AUTOPEER_URL ?? '',
  authServerDomain: process.env.AUTH_SERVER_DOMAIN || 'http://localhost:3006',
  graphqlUrl: process.env.GRAPHQL_URL,
  idpSecret: process.env.IDP_SECRET,
  operatorTenantId: process.env.OPERATOR_TENANT_ID,
  isTenant: process.env.IS_TENANT === 'true'
}
