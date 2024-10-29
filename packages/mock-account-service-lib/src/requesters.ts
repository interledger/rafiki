import { gql, ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Logger } from 'pino'
import type {
  AssetMutationResponse,
  CreatePeerMutationResponse,
  LiquidityMutationResponse,
  WalletAddress,
  CreateWalletAddressKeyMutationResponse,
  CreateWalletAddressKeyInput,
  CreateWalletAddressInput,
  JwkInput,
  SetFeeResponse,
  FeeType,
  CreateOrUpdatePeerByUrlMutationResponse,
  CreateOrUpdatePeerByUrlInput
} from './generated/graphql'
import { v4 as uuid } from 'uuid'

export function createRequesters(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger
): {
  createAsset: (
    code: string,
    scale: number,
    liquidityThreshold: number
  ) => Promise<AssetMutationResponse>
  createPeer: (
    staticIlpAddress: string,
    outgoingEndpoint: string,
    assetId: string,
    assetCode: string,
    name: string,
    liquidityThreshold: number
  ) => Promise<CreatePeerMutationResponse>
  createAutoPeer: (
    peerUrl: string,
    assetId: string
  ) => Promise<CreateOrUpdatePeerByUrlMutationResponse | undefined>
  depositPeerLiquidity: (
    peerId: string,
    amount: string,
    transferUid: string
  ) => Promise<LiquidityMutationResponse>
  depositAssetLiquidity: (
    assetId: string,
    amount: number,
    transferId: string
  ) => Promise<LiquidityMutationResponse>
  createWalletAddress: (
    accountName: string,
    accountUrl: string,
    assetId: string
  ) => Promise<WalletAddress>
  createWalletAddressKey: ({
    walletAddressId,
    jwk
  }: {
    walletAddressId: string
    jwk: string
  }) => Promise<CreateWalletAddressKeyMutationResponse>
  setFee: (
    assetId: string,
    type: FeeType,
    fixed: number,
    basisPoints: number
  ) => Promise<SetFeeResponse>
} {
  return {
    createAsset: (code, scale, liquidityThreshold) =>
      createAsset(apolloClient, code, scale, liquidityThreshold),
    createPeer: (
      staticIlpAddress,
      outgoingEndpoint,
      assetId,
      assetCode,
      name,
      liquidityThreshold
    ) =>
      createPeer(
        apolloClient,
        logger,
        staticIlpAddress,
        outgoingEndpoint,
        assetId,
        assetCode,
        name,
        liquidityThreshold
      ),
    createAutoPeer: (peerUrl, assetId) =>
      createAutoPeer(apolloClient, logger, peerUrl, assetId),
    depositPeerLiquidity: (peerId, amount, transferUid) =>
      depositPeerLiquidity(apolloClient, logger, peerId, amount, transferUid),
    depositAssetLiquidity: (assetId, amount, transferId) =>
      depositAssetLiquidity(apolloClient, logger, assetId, amount, transferId),
    createWalletAddress: (accountName, accountUrl, assetId) =>
      createWalletAddress(
        apolloClient,
        logger,
        accountName,
        accountUrl,
        assetId
      ),
    createWalletAddressKey: ({ walletAddressId, jwk }) =>
      createWalletAddressKey(apolloClient, logger, { walletAddressId, jwk }),
    setFee: (assetId, type, fixed, basisPoints) =>
      setFee(apolloClient, logger, assetId, type, fixed, basisPoints)
  }
}

export async function createAsset(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  code: string,
  scale: number,
  liquidityThreshold: number
): Promise<AssetMutationResponse> {
  const existingAsset = await getAssetByCodeAndScale(apolloClient, code, scale)

  if (existingAsset) {
    return existingAsset
  }

  const createAssetMutation = gql`
    mutation CreateAsset($input: CreateAssetInput!) {
      createAsset(input: $input) {
        asset {
          id
          code
          scale
          liquidityThreshold
        }
      }
    }
  `
  const createAssetInput = {
    input: {
      code,
      scale,
      liquidityThreshold
    }
  }
  return apolloClient
    .mutate({
      mutation: createAssetMutation,
      variables: createAssetInput
    })
    .then(({ data }): AssetMutationResponse => {
      if (!data.createAsset.asset) {
        throw new Error('Data was empty')
      }
      return data.createAsset
    })
}

async function getAssetByCodeAndScale(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  code: string,
  scale: number
) {
  const getAssetQuery = gql`
    query GetAssetByCodeAndScale($code: String!, $scale: UInt8!) {
      assetByCodeAndScale(code: $code, scale: $scale) {
        id
        code
        scale
        liquidityThreshold
      }
    }
  `
  const args = { code: code, scale: scale }
  const { data } = await apolloClient.query({
    query: getAssetQuery,
    variables: args
  })

  if (data.assetByCodeAndScale) {
    return { asset: data.assetByCodeAndScale }
  }
  return null
}

export async function createPeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetId: string,
  assetCode: string,
  name: string,
  liquidityThreshold: number
): Promise<CreatePeerMutationResponse> {
  const existingPeer = await getPeerByAddressAndAsset(
    apolloClient,
    staticIlpAddress,
    assetId
  )
  if (existingPeer) {
    return existingPeer
  }

  const createPeerMutation = gql`
    mutation CreatePeer($input: CreatePeerInput!) {
      createPeer(input: $input) {
        peer {
          id
        }
      }
    }
  `
  const createPeerInput = {
    input: {
      staticIlpAddress,
      http: {
        incoming: { authTokens: [`test-${assetCode}`] },
        outgoing: { endpoint: outgoingEndpoint, authToken: `test-${assetCode}` }
      },
      assetId,
      name,
      liquidityThreshold
    }
  }
  return apolloClient
    .mutate({
      mutation: createPeerMutation,
      variables: createPeerInput
    })
    .then(({ data }): CreatePeerMutationResponse => {
      logger.debug(data)
      if (!data.createPeer.peer) {
        throw new Error('Data was empty')
      }
      return data.createPeer
    })
}

async function getPeerByAddressAndAsset(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  staticIlpAddress: string,
  assetId: string
) {
  const getPeerByAddressAndAssetQuery = gql`
    query getPeerByAddressAndAsset(
      $staticIlpAddress: String!
      $assetId: String!
    ) {
      peerByAddressAndAsset(
        staticIlpAddress: $staticIlpAddress
        assetId: $assetId
      ) {
        id
        name
        asset {
          id
          scale
          code
          withdrawalThreshold
        }
      }
    }
  `
  const args = { staticIlpAddress: staticIlpAddress, assetId: assetId }

  const { data } = await apolloClient.query({
    query: getPeerByAddressAndAssetQuery,
    variables: args
  })

  if (data.peerByAddressAndAsset) {
    return { peer: data.peerByAddressAndAsset }
  }
  return null
}

export async function createAutoPeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  peerUrl: string,
  assetId: string
): Promise<CreateOrUpdatePeerByUrlMutationResponse | undefined> {
  const createAutoPeerMutation = gql`
    mutation CreateOrUpdatePeerByUrl($input: CreateOrUpdatePeerByUrlInput!) {
      createOrUpdatePeerByUrl(input: $input) {
        peer {
          id
          name
          asset {
            id
            scale
            code
            withdrawalThreshold
          }
        }
      }
    }
  `

  const liquidityToDeposit = '10000' as unknown as bigint
  const createPeerInput: { input: CreateOrUpdatePeerByUrlInput } = {
    input: {
      peerUrl,
      assetId,
      liquidityToDeposit
    }
  }
  return apolloClient
    .mutate({
      mutation: createAutoPeerMutation,
      variables: createPeerInput
    })
    .then(({ data }): CreateOrUpdatePeerByUrlMutationResponse => {
      if (!data.createOrUpdatePeerByUrl.peer) {
        logger.debug(data.createOrUpdatePeerByUrl)
        throw new Error(`Data was empty for assetId: ${assetId}`)
      }
      return data.createOrUpdatePeerByUrl
    })
}

export async function depositPeerLiquidity(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  peerId: string,
  amount: string,
  transferUid: string
): Promise<LiquidityMutationResponse> {
  const depositPeerLiquidityMutation = gql`
    mutation DepositPeerLiquidity($input: DepositPeerLiquidityInput!) {
      depositPeerLiquidity(input: $input) {
        success
      }
    }
  `
  const depositPeerLiquidityInput = {
    input: {
      peerId: peerId,
      amount: amount,
      id: transferUid,
      idempotencyKey: uuid()
    }
  }
  return apolloClient
    .mutate({
      mutation: depositPeerLiquidityMutation,
      variables: depositPeerLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      logger.debug(data)
      if (!data.depositPeerLiquidity) {
        throw new Error('Data was empty')
      }
      return data.depositPeerLiquidity
    })
}

export async function depositAssetLiquidity(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  assetId: string,
  amount: number,
  transferId: string
): Promise<LiquidityMutationResponse> {
  const depositAssetLiquidityMutation = gql`
    mutation DepositAssetLiquidity($input: DepositAssetLiquidityInput!) {
      depositAssetLiquidity(input: $input) {
        success
      }
    }
  `
  const depositAssetLiquidityInput = {
    input: {
      assetId,
      amount,
      id: transferId,
      idempotencyKey: uuid()
    }
  }
  return apolloClient
    .mutate({
      mutation: depositAssetLiquidityMutation,
      variables: depositAssetLiquidityInput
    })
    .then(({ data }): LiquidityMutationResponse => {
      logger.debug(data)
      if (!data.depositAssetLiquidity) {
        throw new Error('Data was empty')
      }
      return data.depositAssetLiquidity
    })
}

export async function createWalletAddress(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  accountName: string,
  accountUrl: string,
  assetId: string
): Promise<WalletAddress> {
  const existingWalletAddress = await getWalletAddressByURL(
    apolloClient,
    accountUrl
  )
  if (existingWalletAddress) {
    return existingWalletAddress
  }

  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
        walletAddress {
          id
          url
          publicName
        }
      }
    }
  `
  const createWalletAddressInput: CreateWalletAddressInput = {
    assetId,
    url: accountUrl,
    publicName: accountName,
    additionalProperties: []
  }

  return apolloClient
    .mutate({
      mutation: createWalletAddressMutation,
      variables: {
        input: createWalletAddressInput
      }
    })
    .then(({ data }) => {
      logger.debug(data)

      if (!data.createWalletAddress.walletAddress) {
        throw new Error('Data was empty')
      }

      return data.createWalletAddress.walletAddress
    })
}

async function getWalletAddressByURL(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  url: string
) {
  const query = gql`
    query getWalletAddressByUrl($url: String!) {
      walletAddressByUrl(url: $url) {
        id
        liquidity
        url
        publicName
        asset {
          id
          scale
          code
          withdrawalThreshold
        }
      }
    }
  `
  const { data } = await apolloClient.query({
    query: query,
    variables: { url: url }
  })

  return data.walletAddressByUrl ?? null
}

export async function createWalletAddressKey(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  {
    walletAddressId,
    jwk
  }: {
    walletAddressId: string
    jwk: string
  }
): Promise<CreateWalletAddressKeyMutationResponse> {
  const createWalletAddressKeyMutation = gql`
    mutation CreateWalletAddressKey($input: CreateWalletAddressKeyInput!) {
      createWalletAddressKey(input: $input) {
        walletAddressKey {
          id
        }
      }
    }
  `
  const createWalletAddressKeyInput: CreateWalletAddressKeyInput = {
    walletAddressId,
    jwk: jwk as unknown as JwkInput
  }

  return apolloClient
    .mutate({
      mutation: createWalletAddressKeyMutation,
      variables: {
        input: createWalletAddressKeyInput
      }
    })
    .then(({ data }): CreateWalletAddressKeyMutationResponse => {
      logger.debug(data)
      if (!data.createWalletAddressKey.walletAddressKey) {
        throw new Error('Data was empty')
      }
      return data.createWalletAddressKey
    })
}

export async function setFee(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  assetId: string,
  type: FeeType,
  fixed: number,
  basisPoints: number
): Promise<SetFeeResponse> {
  const setFeeMutation = gql`
    mutation SetFee($input: SetFeeInput!) {
      setFee(input: $input) {
        fee {
          id
          assetId
          type
          fixed
          basisPoints
        }
      }
    }
  `

  const setFeeInput = {
    assetId,
    type,
    fee: {
      fixed: String(fixed),
      basisPoints
    }
  }

  return apolloClient
    .mutate({
      mutation: setFeeMutation,
      variables: {
        input: setFeeInput
      }
    })
    .then(({ data }): SetFeeResponse => {
      logger.debug(data)
      if (!data.setFee) {
        throw new Error('Data was empty')
      }
      return data.setFee
    })
}
