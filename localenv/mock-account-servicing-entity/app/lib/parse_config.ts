import type * as crypto from 'crypto'
import { parse } from 'yaml'
import { readFileSync } from 'fs'
import { parseOrProvisionKey } from '@interledger/http-signature-utils'

export interface Self {
  graphqlUrl: string
  hostname: string
  mapHostname: string
  openPaymentPublishedPort: number
}

export interface Asset {
  code: string
  scale: number
}

export interface Fees {
  fixed: number
  percentage: number
}

export interface Peering {
  peerUrl: string
  peerIlpAddress: string
  initialLiquidity: string
  name: string
}

export interface Account {
  name: string
  id: string
  initialBalance: bigint
  path: string
  postmanEnvVar: string
}

export interface SeedInstance {
  self: Self
  asset: Asset
  peers: Array<Peering>
  accounts: Array<Account>
  fees: Array<Fees>
}

export interface Config {
  seed: SeedInstance
  key: crypto.KeyObject
}

export const CONFIG: Config = {
  seed: parse(
    readFileSync(
      process.env.SEED_FILE_LOCATION || `./seed.example.yml`
    ).toString('utf8')
  ),
  key: parseOrProvisionKey(process.env.KEY_FILE)
}
