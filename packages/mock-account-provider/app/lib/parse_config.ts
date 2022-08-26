import { parse } from 'yaml'
import { readFileSync } from 'fs'

export interface Self {
  graphqlUrl: string
  hostname: string
  mapHostname: string
  openPaymentPublishedPort: number
}

export interface Peering {
  peerUrl: string
  peerIlpAddress: string
  asset: string
  scale: number
  initialLiquidity: number
}

export interface Account {
  name: string
  id: string
  asset: string
  scale: number
  initialBalance: bigint
  path: string
  postmanEnvVar: string
}

export interface SeedInstance {
  self: Self
  peers: Array<Peering>
  accounts: Array<Account>
}

export const CONFIG: SeedInstance = parse(
  readFileSync(process.env.SEED_FILE_LOCATION || `./seed.example.yml`).toString(
    'utf8'
  )
)
