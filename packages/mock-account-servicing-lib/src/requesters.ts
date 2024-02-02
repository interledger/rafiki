import { gql, ApolloClient, NormalizedCacheObject } from '@apollo/client'
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
  debug: boolean
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
        staticIlpAddress,
        outgoingEndpoint,
        assetId,
        assetCode,
        name,
        liquidityThreshold,
        debug
      ),
    createAutoPeer: (peerUrl, assetId) =>
      createAutoPeer(apolloClient, peerUrl, assetId, debug),
    depositPeerLiquidity: (peerId, amount, transferUid) =>
      depositPeerLiquidity(apolloClient, peerId, amount, transferUid, debug),
    depositAssetLiquidity: (assetId, amount, transferId) =>
      depositAssetLiquidity(apolloClient, assetId, amount, transferId, debug),
    createWalletAddress: (accountName, accountUrl, assetId) =>
      createWalletAddress(
        apolloClient,
        accountName,
        accountUrl,
        assetId,
        debug
      ),
    createWalletAddressKey: ({ walletAddressId, jwk }) =>
      createWalletAddressKey(apolloClient, { walletAddressId, jwk }, debug),
    setFee: (assetId, type, fixed, basisPoints) =>
      setFee(apolloClient, assetId, type, fixed, basisPoints, debug)
  }
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
        code
        success
        message
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
      if (!data.createAsset.success) {
        throw new Error('Data was empty')
      }
      return data.createAsset
    })
}

export async function createPeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  staticIlpAddress: string,
  outgoingEndpoint: string,
  assetId: string,
  assetCode: string,
  name: string,
  liquidityThreshold: number,
  debug: boolean
): Promise<CreatePeerMutationResponse> {
  const createPeerMutation = gql`
    mutation CreatePeer($input: CreatePeerInput!) {
      createPeer(input: $input) {
        code
        success
        message
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
      if (debug) {
        console.log(data)
      }
      if (!data.createPeer.success) {
        throw new Error('Data was empty')
      }
      return data.createPeer
    })
}

export async function createAutoPeer(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  peerUrl: string,
  assetId: string,
  debug: boolean
): Promise<CreateOrUpdatePeerByUrlMutationResponse | undefined> {
  const createAutoPeerMutation = gql`
    mutation CreateOrUpdatePeerByUrl($input: CreateOrUpdatePeerByUrlInput!) {
      createOrUpdatePeerByUrl(input: $input) {
        code
        success
        message
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
      if (!data.createOrUpdatePeerByUrl.success) {
        if (debug) {
          console.log(data.createOrUpdatePeerByUrl)
        }
        throw new Error(`Data was empty for assetId: ${assetId}`)
      }
      return data.createOrUpdatePeerByUrl
    })
}

export async function depositPeerLiquidity(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  peerId: string,
  amount: string,
  transferUid: string,
  debug: boolean
): Promise<LiquidityMutationResponse> {
  const depositPeerLiquidityMutation = gql`
    mutation DepositPeerLiquidity($input: DepositPeerLiquidityInput!) {
      depositPeerLiquidity(input: $input) {
        code
        success
        message
        error
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
      if (debug) {
        console.log(data)
      }
      if (!data.depositPeerLiquidity.success) {
        throw new Error('Data was empty')
      }
      return data.depositPeerLiquidity
    })
}

export async function depositAssetLiquidity(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  assetId: string,
  amount: number,
  transferId: string,
  debug: boolean
): Promise<LiquidityMutationResponse> {
  const depositAssetLiquidityMutation = gql`
    mutation DepositAssetLiquidity($input: DepositAssetLiquidityInput!) {
      depositAssetLiquidity(input: $input) {
        code
        success
        message
        error
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
      if (debug) {
        console.log(data)
      }
      if (!data.depositAssetLiquidity.success) {
        throw new Error('Data was empty')
      }
      return data.depositAssetLiquidity
    })
}

export async function createWalletAddress(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  accountName: string,
  accountUrl: string,
  assetId: string,
  debug: boolean
): Promise<WalletAddress> {
  const createWalletAddressMutation = gql`
    mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
      createWalletAddress(input: $input) {
        code
        success
        message
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
    publicName: accountName
  }

  return apolloClient
    .mutate({
      mutation: createWalletAddressMutation,
      variables: {
        input: createWalletAddressInput
      }
    })
    .then(({ data }) => {
      if (debug) {
        console.log(data)
      }

      if (
        !data.createWalletAddress.success ||
        !data.createWalletAddress.walletAddress
      ) {
        throw new Error('Data was empty')
      }

      return data.createWalletAddress.walletAddress
    })
}

export async function createWalletAddressKey(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  {
    walletAddressId,
    jwk
  }: {
    walletAddressId: string
    jwk: string
  },
  debug: boolean
): Promise<CreateWalletAddressKeyMutationResponse> {
  const createWalletAddressKeyMutation = gql`
    mutation CreateWalletAddressKey($input: CreateWalletAddressKeyInput!) {
      createWalletAddressKey(input: $input) {
        code
        success
        message
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
      if (debug) {
        console.log(data)
      }
      if (!data.createWalletAddressKey.success) {
        throw new Error('Data was empty')
      }
      return data.createWalletAddressKey
    })
}

export async function setFee(
  apolloClient: ApolloClient<NormalizedCacheObject>,
  assetId: string,
  type: FeeType,
  fixed: number,
  basisPoints: number,
  debug: boolean
): Promise<SetFeeResponse> {
  const setFeeMutation = gql`
    mutation SetFee($input: SetFeeInput!) {
      setFee(input: $input) {
        code
        success
        message
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
      if (debug) {
        console.log(data)
      }
      if (!data.setFee) {
        throw new Error('Data was empty')
      }
      return data.setFee
    })
}
