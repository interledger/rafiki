import {
  CONFIG,
  type Config,
  type Account,
  type Peering,
  type Hydra
} from './parse_config.server'
import {
  createAsset,
  createPeer,
  depositPeerLiquidity,
  createWalletAddress,
  createWalletAddressKey,
  setFee,
  depositAssetLiquidity,
  createAutoPeer
} from './requesters'
import { v4 } from 'uuid'
import { mockAccounts } from './accounts.server'
import { generateJwk } from '@interledger/http-signature-utils'
import { Asset, FeeType } from 'generated/graphql'
import axios from 'axios'

// TODO move to appropriate location
async function createHydraClient(clientId: string, clientName: string, redirectUri: string) {
  const clientData = {
    grant_types: ['authorization_code'],
    client_id: clientId,
    client_name: clientName,
    redirect_uris: [redirectUri],
    response_types: ['code'],
    scope: 'full_access',
    client_secret:'YourClientSecret',
    skip_consent: true,
    token_endpoint_auth_method: 'client_secret_post'
  }

  // TODO: error handling
  try {
    const existingClientResponse = await axios.get(`http://hydra:4445/admin/clients/${clientId}`)
    if (existingClientResponse.data) {
      console.log(`Client already exists: ${clientId}`)
      return
    }
  } catch (error) {
    if (error.response && error.response.status === 404) {
      const response = await axios.post('http://hydra:4445/admin/clients', clientData)
      console.log('Hydra client created: ', response.data)
      return
    }
    throw new Error(`Error creating Hydra client: ${error}`)
  }
}

export async function setupFromSeed(config: Config): Promise<void> {
  //set env var for client_id
  createHydraClient(config.seed.hydra.clientId, config.seed.hydra.name, config.seed.hydra.redirectUri)
  
  const assets: Record<string, Asset> = {}
  for (const { code, scale, liquidity, liquidityThreshold } of config.seed
    .assets) {
    const { asset } = await createAsset(code, scale, liquidityThreshold)
    if (!asset) {
      throw new Error('asset not defined')
    }

    const initialLiquidity = await depositAssetLiquidity(
      asset.id,
      liquidity,
      v4()
    )

    assets[code] = asset
    console.log(JSON.stringify({ asset, initialLiquidity }, null, 2))

    const { fees } = config.seed
    const fee = fees.find((fee) => fee.asset === code && fee.scale == scale)
    if (fee) {
      await setFee(asset.id, FeeType.Sending, fee.fixed, fee.basisPoints)
    }
  }

  const peeringAsset = config.seed.peeringAsset

  const peerResponses = await Promise.all(
    config.seed.peers.map(async (peer: Peering) => {
      const peerResponse = await createPeer(
        peer.peerIlpAddress,
        peer.peerUrl,
        assets[peeringAsset].id,
        assets[peeringAsset].code,
        peer.name,
        peer.liquidityThreshold
      ).then((response) => response.peer)
      if (!peerResponse) {
        throw new Error('peer response not defined')
      }
      const transferUid = v4()
      const liquidity = await depositPeerLiquidity(
        peerResponse.id,
        peer.initialLiquidity,
        transferUid
      )
      return [peerResponse, liquidity]
    })
  )

  console.log(JSON.stringify(peerResponses, null, 2))

  if (CONFIG.testnetAutoPeerUrl) {
    console.log('autopeering url: ', CONFIG.testnetAutoPeerUrl)
    const autoPeerResponse = await createAutoPeer(
      CONFIG.testnetAutoPeerUrl,
      assets[peeringAsset].id
    ).catch((e) => {
      console.log('error on autopeering: ', e)
      return
    })
    console.log(JSON.stringify(autoPeerResponse, null, 2))
  }

  // Clear the accounts before seeding.
  await mockAccounts.clearAccounts()

  const accountResponses = await Promise.all(
    config.seed.accounts.map(async (account: Account) => {
      const accountAsset = assets[account.assetCode]
      await mockAccounts.create(
        account.id,
        account.path,
        account.name,
        accountAsset.code,
        accountAsset.scale,
        accountAsset.id
      )
      if (account.initialBalance) {
        await mockAccounts.credit(
          account.id,
          BigInt(account.initialBalance),
          false
        )
      }

      if (account.skipWalletAddressCreation) {
        return
      }

      console.log('hostname: ', CONFIG.publicHost)
      const walletAddress = await createWalletAddress(
        account.name,
        `${CONFIG.publicHost}/${account.path}`,
        accountAsset.id
      )

      await mockAccounts.setWalletAddress(
        account.id,
        walletAddress.id,
        walletAddress.url
      )

      await createWalletAddressKey({
        walletAddressId: walletAddress.id,
        jwk: generateJwk({
          keyId: `keyid-${account.id}`,
          privateKey: config.key
        }) as unknown as string
      })

      return walletAddress
    })
  )
  console.log('seed complete')
  console.log(JSON.stringify(accountResponses, null, 2))
  const hostname = new URL(CONFIG.publicHost).hostname
  const envVarStrings = config.seed.accounts.map((account) => {
    return `${account.brunoEnvVar}: ${CONFIG.publicHost}/${account.path} hostname: ${hostname}`
  })
  console.log(envVarStrings.join('\n'))
}

export async function runSeed(): Promise<void> {
  console.log('calling run_seed')
  return setupFromSeed(CONFIG)
}
