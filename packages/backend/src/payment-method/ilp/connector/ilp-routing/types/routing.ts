export interface IncomingRoute {
  peer: string
  prefix: string
  path: string[]
  weight?: number
  auth?: Buffer
}

export interface Route {
  nextHop: string
  path: string[]
  weight?: number
  auth?: Buffer
}

export interface BroadcastRoute extends Route {
  prefix: string
}
