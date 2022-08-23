import { parse } from 'yaml'
import { readFileSync } from 'fs'

export interface Self {
  hostname: string
  mapHostname: string
}

export interface Peering {
  peerHostname: string
  asset: string
  scale: string
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

const config: SeedInstance = parse(
  readFileSync(
    process.env.SEED_FILE_LOCATION || `${__dirname}/../seed.example.yml`
  ).toString('utf8')
)

console.log(config)
