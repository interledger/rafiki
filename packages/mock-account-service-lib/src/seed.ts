import { v4 } from 'uuid'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import createLogger, { LevelWithSilent, LoggerOptions } from 'pino'
import { generateJwk } from '@interledger/http-signature-utils'
import { createRequesters, createTenant } from './requesters'
import { Config } from './types'
import { Asset, FeeType, Tenant } from './generated/graphql'
import { AccountProvider } from './account-provider'

interface SetupFromSeedOptions {
  logLevel?: LevelWithSilent
  pinoPretty?: boolean
}

export async function setupFromSeed(
  config: Config,
  generateApolloClient: (options?: {
    tenantId: string
    apiSecret: string
  }) => ApolloClient<NormalizedCacheObject>,
  mockAccounts: AccountProvider,
  options: SetupFromSeedOptions = {}
): Promise<{ tenantId: string; apiSecret: string } | undefined> {
  const { logLevel = 'info', pinoPretty = false } = options

  const loggerOptions: LoggerOptions<never> = {
    level: logLevel
  }

  if (pinoPretty) {
    loggerOptions.transport = { target: 'pino-pretty' }
  }

  const apolloClient = generateApolloClient()

  const logger = createLogger(loggerOptions)

  let createdTenant: Tenant | undefined
  let requesterApolloClient: ApolloClient<NormalizedCacheObject> = apolloClient
  if (config.isTenant) {
    const seedTenant = config.seed.tenants[0]
    createdTenant = (
      await createTenant(
        apolloClient,
        seedTenant.publicName,
        seedTenant.apiSecret,
        seedTenant.idpConsentUrl,
        seedTenant.idpSecret,
        seedTenant.walletAddressPrefix,
        seedTenant.webhookUrl,
        seedTenant.id
      )
    ).tenant
    requesterApolloClient = generateApolloClient({
      tenantId: createdTenant.id,
      apiSecret: createdTenant.apiSecret
    })
  }

  const {
    createAsset,
    depositAssetLiquidity,
    setFee,
    createPeer,
    updatePeer,
    deletePeer,
    depositPeerLiquidity,
    createAutoPeer,
    createWalletAddress,
    createWalletAddressKey,
    getAssetByCodeAndScale,
    getWalletAddressByURL,
    getPeerByAddressAndAsset
  } = createRequesters(requesterApolloClient, logger)

  const assets: Record<string, Asset> = {}
  for (const { code, scale, liquidity, liquidityThreshold } of config.seed
    .assets) {
    let asset = await getAssetByCodeAndScale(code, scale)
    if (!asset) {
      asset = (await createAsset(code, scale, liquidityThreshold)).asset || null
      if (!asset) {
        throw new Error(`Could not create asset: ${code}  ${scale}`)
      }
      await depositAssetLiquidity(asset.id, liquidity, v4())
    }

    assets[code] = asset
    logger.debug({ asset, liquidity })

    const { fees } = config.seed
    const fee = fees.find((fee) => fee.asset === code && fee.scale == scale)
    if (fee) {
      await setFee(asset.id, FeeType.Sending, fee.fixed, fee.basisPoints)
    }
  }

  logger.debug('Finished seeding assets')

  const peeringAsset = config.seed.peeringAsset

  const host = config.isTenant
    ? config.seed.tenants[0].walletAddressPrefix
    : config.publicHost

  for (const peer of config.seed.peers) {
    const existingPeer = await getPeerByAddressAndAsset(
      peer.peerIlpAddress,
      assets[peeringAsset].id
    )

    if (existingPeer && existingPeer.staticIlpAddress === peer.peerIlpAddress) {
      // Needed for refreshing routes if changed in seed (when going back and forth from multihop mode)
      await updatePeer({ id: existingPeer.id, routes: peer.routes || [] })
      continue
    }

    const newPeer = await createPeer(
      peer.peerIlpAddress,
      peer.peerUrl,
      assets[peeringAsset].id,
      peer.name,
      peer.routes || [],
      peer.liquidityThreshold,
      peer.tokens.incoming,
      peer.tokens.outgoing,
      peer.maxPacketAmount
    ).then((response) => response.peer || null)

    if (!newPeer) {
      throw new Error('Could not create peer')
    }

    const transferUid = v4()
    await depositPeerLiquidity(newPeer.id, peer.initialLiquidity, transferUid)
  }

  logger.debug('Finished seeding peers')

  // Enforce multihop automatically: if the global-bank backend is reachable,
  // remove direct peers between cloud-nine/cloud-ten and happy-life so routing goes through global-bank.
  try {
    const globalPeerSeed = config.seed.peers.find((p) =>
      p.peerIlpAddress.startsWith('test.global-bank')
    )
    if (globalPeerSeed) {
      const adminHealthUrl = getBackendHealthUrl(
        globalPeerSeed.peerUrl
      )
      if (await isBackendReachable(adminHealthUrl)) {
        logger.debug('global-bank backend is reachable, enforcing multihop')
        const peersToBeDeleted: string[] = config.seed.peers
          .filter((p) => !p.peerIlpAddress.startsWith('test.global-bank'))
          .map((p) => p.peerIlpAddress)

        for (const p of peersToBeDeleted) {
          const peer = await getPeerByAddressAndAsset(
            p,
            assets[peeringAsset].id
          )
          if (peer) {
            await deletePeer(peer.id)
          }
        }
        logger.debug('Multihop enforced: removed direct peers where present')
      }
    }
  } catch (e) {
    logger.debug('Multihop enforcement skipped', e)
  }

  if (config.testnetAutoPeerUrl) {
    logger.debug('autopeering url: ', config.testnetAutoPeerUrl)
    const autoPeerResponse = await createAutoPeer(
      config.testnetAutoPeerUrl,
      assets[peeringAsset].id
    ).catch((e) => {
      logger.debug('error on autopeering: ', e)
      return
    })
    logger.debug(autoPeerResponse)
  }

  // Clear the accounts before seeding.
  await mockAccounts.clearAccounts()

  for (const account of config.seed.accounts) {
    const accountAsset = assets[account.assetCode]

    if (!accountAsset) {
      throw new Error(
        `Trying to create an account with a non-existing asset: ${account.assetCode}`
      )
    }

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
      continue
    }

    const url = `${host}/${account.path}`
    let walletAddress = await getWalletAddressByURL(url)
    if (!walletAddress) {
      walletAddress = await createWalletAddress(
        account.name,
        url,
        accountAsset.id
      )

      await createWalletAddressKey({
        walletAddressId: walletAddress.id,
        jwk: generateJwk({
          keyId: `keyid-${account.id}`,
          privateKey: config.key
        }) as unknown as string
      })
    }

    await mockAccounts.setWalletAddress(
      account.id,
      walletAddress.id,
      walletAddress.address
    )
  }

  logger.debug('Finished seeding accounts/wallet addresses')
  logger.debug('Seed complete')

  const hostname = new URL(host).hostname
  const envVarStrings = config.seed.accounts.map((account) => {
    return `${account.brunoEnvVar}: ${host}/${account.path} hostname: ${hostname}`
  })
  logger.debug(envVarStrings)

  return createdTenant
    ? { tenantId: createdTenant.id, apiSecret: createdTenant.apiSecret }
    : undefined
}

function getBackendHealthUrl(connectorUrl: string): string {
  try {
    const url = new URL(connectorUrl)
    const port = url.port === '3002' ? '3001' : url.port
    url.port = port
    url.pathname = '/healthz'
    return url.toString()
  } catch {
    return connectorUrl
  }
}

async function isBackendReachable(url: string): Promise<boolean> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 5000)
  try {
    const res = await fetch(url, { method: 'GET', signal: controller.signal })
    return res.ok
  } catch {
    return false
  } finally {
    clearTimeout(timeout)
  }
}
