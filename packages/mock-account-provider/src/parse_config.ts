import { parse } from 'yaml'
import { readFileSync } from 'fs'

export interface Self {
  graphqlUrl: string
  hostname: string
  mapHostname: string
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
  initialBalance: string
}

export interface SeedInstance {
  self: Self
  peers: Array<Peering>
  accounts: Array<Account>
}

export const CONFIG: SeedInstance = parse(
  readFileSync(
    process.env.SEED_FILE_LOCATION || `${__dirname}/../../seed.example.yml`
  ).toString('utf8')
)
