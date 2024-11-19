import { v4 } from 'uuid'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'
import createLogger, { LevelWithSilent, LoggerOptions } from 'pino'
import { generateJwk } from '@interledger/http-signature-utils'
import { createRequesters } from './requesters'
import { Config, Account, Peering } from './types'
import { Asset, FeeType } from './generated/graphql'
import { AccountProvider } from './account-provider'

interface SetupFromSeedOptions {
  logLevel?: LevelWithSilent
  pinoPretty?: boolean
}

export async function setupFromSeed(
  config: Config,
  apolloClient: ApolloClient<NormalizedCacheObject>,
  mockAccounts: AccountProvider,
  options: SetupFromSeedOptions = {}
): Promise<void> {
  const { logLevel = 'info', pinoPretty = false } = options

  const loggerOptions: LoggerOptions<never> = {
    level: logLevel
  }

  if (pinoPretty) {
    loggerOptions.transport = { target: 'pino-pretty' }
  }

  const logger = createLogger(loggerOptions)
  const {
    createAsset,
    depositAssetLiquidity,
    setFee,
    createPeer,
    depositPeerLiquidity,
    createAutoPeer,
    createWalletAddress,
    createWalletAddressKey,
    getAssetByCodeAndScale,
    getWalletAddressByURL,
    getPeerByAddressAndAsset
  } = createRequesters(apolloClient, logger)

  const assets: Record<string, Asset> = {}
  for (const { code, scale, liquidity, liquidityThreshold } of config.seed
    .assets) {
    let asset = await getAssetByCodeAndScale(code, scale)
    if (!asset) {
      asset = (await createAsset(code, scale, liquidityThreshold)).asset || null
    }
    if (!asset) {
      throw new Error('asset not defined')
    }

    await depositAssetLiquidity(asset.id, liquidity, v4())

    assets[code] = asset
    logger.debug({ asset, liquidity })

    const { fees } = config.seed
    const fee = fees.find((fee) => fee.asset === code && fee.scale == scale)
    if (fee) {
      await setFee(asset.id, FeeType.Sending, fee.fixed, fee.basisPoints)
    }
  }

  const peeringAsset = config.seed.peeringAsset

  const peerResponses = await Promise.all(
    config.seed.peers.map(async (peer: Peering) => {
      let peerResponse = await getPeerByAddressAndAsset(
        peer.peerIlpAddress,
        assets[peeringAsset].id
      )
      if (!peerResponse) {
        peerResponse = await createPeer(
          peer.peerIlpAddress,
          peer.peerUrl,
          assets[peeringAsset].id,
          assets[peeringAsset].code,
          peer.name,
          peer.liquidityThreshold
        ).then((response) => response.peer || null)
      }
      if (!peerResponse) {
        throw new Error('peer response not defined')
      }
      const transferUid = v4()
      await depositPeerLiquidity(
        peerResponse.id,
        peer.initialLiquidity,
        transferUid
      )
      return [peerResponse, peer.initialLiquidity]
    })
  )

  logger.debug(peerResponses)

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

      logger.debug('hostname: ', config.publicHost)

      const url = `${config.publicHost}/${account.path}`
      let walletAddress = await getWalletAddressByURL(url)
      if (!walletAddress) {
        walletAddress = await createWalletAddress(
          account.name,
          url,
          accountAsset.id
        )
      }

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
  logger.debug('seed complete')
  logger.debug(accountResponses)
  const hostname = new URL(config.publicHost).hostname
  const envVarStrings = config.seed.accounts.map((account) => {
    return `${account.brunoEnvVar}: ${config.publicHost}/${account.path} hostname: ${hostname}`
  })
  logger.debug(envVarStrings)
}
