import { parse } from 'yaml'
import { readFileSync } from 'fs'

export interface Client {
  id: string
  name: string
  redirectUri: string
}

export interface Config {
  clients: Array<Client>
}

export const CONFIG: Config = parse(
  readFileSync(process.env.SEED_FILE_LOCATION || `./seed.example.yml`).toString(
    'utf8'
  )
)
