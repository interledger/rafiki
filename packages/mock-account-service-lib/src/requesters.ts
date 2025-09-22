import { gql, ApolloClient, NormalizedCacheObject } from '@apollo/client'
import { Logger } from 'pino'
import {
  type AssetMutationResponse,
  type CreatePeerMutationResponse,
  type LiquidityMutationResponse,
  type WalletAddress,
  type CreateWalletAddressKeyMutationResponse,
  type CreateWalletAddressKeyInput,
  type CreateWalletAddressInput,
  type JwkInput,
  type SetFeeResponse,
  type FeeType,
  type CreateOrUpdatePeerByUrlMutationResponse,
  type CreateOrUpdatePeerByUrlInput,
  type Peer,
  type Asset,
  type TenantMutationResponse,
  type CreateTenantInput,
  TenantSettingKey,
  type UpdatePeerMutationResponse,
  type UpdatePeerInput
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
    name: string,
    routes: string[],
    liquidityThreshold: number,
    incomingTokens: string[],
    outgoingToken: string,
    maxPacketAmount?: number
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
  getAssetByCodeAndScale: (code: string, scale: number) => Promise<Asset | null>
  getWalletAddressByURL: (url: string) => Promise<WalletAddress | null>
  getPeerByAddressAndAsset: (
    staticIlpAddress: string,
    assetId: string
  ) => Promise<Peer | null>
  updatePeer: (input: UpdatePeerInput) => Promise<UpdatePeerMutationResponse>
} {
  return {
    createAsset: (code, scale, liquidityThreshold) =>
      createAsset(apolloClient, code, scale, liquidityThreshold),
    createPeer: (
      staticIlpAddress,
      outgoingEndpoint,
      assetId,
      name,
      routes,
      liquidityThreshold,
      incomingToken,
      outgoingToken,
      maxPacketAmount
    ) =>
      createPeer(
        apolloClient,
        logger,
        staticIlpAddress,
        outgoingEndpoint,
        assetId,
        name,
        routes,
        liquidityThreshold,
        incomingToken,
        outgoingToken,
        maxPacketAmount
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
      setFee(apolloClient, logger, assetId, type, fixed, basisPoints),
    getAssetByCodeAndScale: (code, scale) =>
      getAssetByCodeAndScale(apolloClient, code, scale),
    getWalletAddressByURL: (url) => getWalletAddressByURL(apolloClient, url),
    getPeerByAddressAndAsset: (staticIlpAddress, assetId) =>
      getPeerByAddressAndAsset(apolloClient, staticIlpAddress, assetId),
    updatePeer: (input: UpdatePeerInput) =>
      updatePeer(apolloClient, logger, input)
  }
}

export async function createTenant(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  publicName: string,
  apiSecret: string,
  idpConsentUrl: string,
  idpSecret: string,
  walletAddressUrl: string,
  webhookUrl: string,
  id?: string
): Promise<TenantMutationResponse> {
  const input: CreateTenantInput = {
    id,
    apiSecret,
    publicName,
    idpConsentUrl,
    idpSecret,
    settings: [
      {
        key: TenantSettingKey.WalletAddressUrl,
        value: walletAddressUrl
      },
      {
        key: TenantSettingKey.WebhookUrl,
        value: webhookUrl
      }
    ]
  }
  const createTenantMutation = gql`
    mutation CreateTenant($input: CreateTenantInput!) {
      createTenant(input: $input) {
        tenant {
          id
          apiSecret
        }
      }
    }
  `

  return apolloClient
    .mutate({
      mutation: createTenantMutation,
      variables: { input }
    })
    .then(({ data }): TenantMutationResponse => {
      if (!data.createTenant.tenant) {
        throw new Error('Data was empty')
      }
      return data.createTenant
    })
}

export async function createAsset(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  code: string,
  scale: number,
  liquidityThreshold: number
): Promise<AssetMutationResponse> {
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

export async function createPeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetId: string,
  name: string,
  routes: string[],
  liquidityThreshold: number,
  incomingTokens: string[],
  outgoingToken: string,
  maxPacketAmount?: number
): Promise<CreatePeerMutationResponse> {
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
        incoming: { authTokens: incomingTokens },
        outgoing: {
          endpoint: outgoingEndpoint,
          authToken: outgoingToken
        }
      },
      assetId,
      name,
      liquidityThreshold,
      maxPacketAmount,
      routes
    }
  }

  if (maxPacketAmount) {
    createPeerInput.input.maxPacketAmount = maxPacketAmount
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

export async function updatePeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  logger: Logger,
  input: UpdatePeerInput
): Promise<UpdatePeerMutationResponse> {
  const updatePeerMutation = gql`
    mutation UpdatePeer($input: UpdatePeerInput!) {
      updatePeer(input: $input) {
        peer {
          id
        }
      }
    }
  `

  return apolloClient
    .mutate({
      mutation: updatePeerMutation,
      variables: { input }
    })
    .then(({ data }): UpdatePeerMutationResponse => {
      logger.debug(data)
      if (!data?.updatePeer) {
        throw new Error('Data was empty')
      }
      return data.updatePeer
    })
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
  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
        walletAddress {
          id
          address
          publicName
        }
      }
    }
  `

  const createWalletAddressInput: CreateWalletAddressInput = {
    assetId,
    address: accountUrl,
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

async function getAssetByCodeAndScale(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  code: string,
  scale: number
): Promise<Asset | null> {
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

  return data.assetByCodeAndScale
}

async function getWalletAddressByURL(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  url: string
): Promise<WalletAddress | null> {
  const query = gql`
    query getWalletAddressByUrl($url: String!) {
      walletAddressByUrl(url: $url) {
        id
        liquidity
        address
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

  return data.walletAddressByUrl
}

async function getPeerByAddressAndAsset(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  staticIlpAddress: string,
  assetId: string
): Promise<Peer | null> {
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
        staticIlpAddress
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

  return data.peerByAddressAndAsset ?? null
}
