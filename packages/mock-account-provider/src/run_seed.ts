import { parse } from 'yaml'
import { readFileSync } from 'fs'
import fetch from 'node-fetch'
import * as _ from 'lodash'

const config: SeedInstance = parse(
  readFileSync(
    process.env.SEED_FILE_LOCATION || `${__dirname}/../seed.example.yml`
  ).toString('utf8')
)

console.log(JSON.stringify(config))

setupFromSeed(config).then((data) => {
  console.log(data)
})

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

export interface GraphqlQueryConfig {
  resource: string
  method: string
  query: string
  variables: object
}

async function graphqlQuery(options: GraphqlQueryConfig) {
  console.log(options.resource)
  return await fetch(options.resource, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query: options.query, variables: options.variables })
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(
          `response not ok: ${response.status} ${response.statusText}`
        )
      }
      return response.json()
    })
    .then((data: { data: [{ code: string }] }) => {
      _.each(data.data, (v, k) => {
        if (v.code !== '200') {
          throw new Error(
            `graphql response for ${k} contained non-200 code: \n${JSON.stringify(
              data,
              null,
              2
            )}`
          )
        }
      })
      return data
    })
    .catch((e) => {
      console.log(e)
      throw e
    })
}

async function createPeer(
  backendUrl: string,
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetCode: string,
  assetScale: number
): Promise<object> {
  const createPeerQuery = `
  mutation CreatePeer ($input: CreatePeerInput!) {
    createPeer (input: $input) {
      code
      success
      message
      peer {
        id
        asset {
          code
          scale
        }
        staticIlpAddress
      }
    }
  }
  `
  const createPeerInput = {
    input: {
      staticIlpAddress,
      http: {
        incoming: { authTokens: ['test'] },
        outgoing: { endpoint: outgoingEndpoint, authToken: 'test' }
      },
      asset: {
        code: assetCode,
        scale: assetScale
      }
    }
  }
  return graphqlQuery({
    resource: backendUrl,
    method: 'post',
    query: createPeerQuery,
    variables: createPeerInput
  })
}

async function setupFromSeed(config: SeedInstance): Promise<void> {
  const peers = await Promise.all(
    _.map(config.peers, (peer: Peering) => {
      return createPeer(
        config.self.graphqlUrl,
        peer.peerIlpAddress,
        peer.peerUrl,
        peer.asset,
        peer.scale
      )
    })
  )
  console.log(JSON.stringify(peers, null, 2))
}
