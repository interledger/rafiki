import { components, operations } from './openapi/generated/types'

export type IntrospectArgs =
  operations['post-introspect']['requestBody']['content']['application/json']
export type JWK = components['schemas']['json-web-key']

export type TokenInfoClient =
  | { walletAddress: string; jwk?: never }
  | { jwk: JWK; walletAddress?: never }

export type ActiveTokenInfo = Omit<
  components['schemas']['token-info'],
  'client'
> & {
  client: TokenInfoClient
}

export type TokenInfo = { active: false } | ActiveTokenInfo

export type ActiveTokenInfoWithWalletAddressClient = ActiveTokenInfo & {
  client: { walletAddress: string; jwk?: never }
}

export type ActiveTokenInfoWithJwkClient = ActiveTokenInfo & {
  client: { jwk: JWK; walletAddress?: never }
}

export const isActiveTokenInfo = (
  tokenInfo: TokenInfo
): tokenInfo is ActiveTokenInfo => tokenInfo.active

export const isClientWalletAddress = (
  tokenInfo: ActiveTokenInfo
): tokenInfo is ActiveTokenInfoWithWalletAddressClient =>
  'walletAddress' in tokenInfo.client

export const isClientJwk = (
  tokenInfo: ActiveTokenInfo
): tokenInfo is ActiveTokenInfoWithJwkClient => 'jwk' in tokenInfo.client
