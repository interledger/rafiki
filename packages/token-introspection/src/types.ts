import {
  // components,
  external,
  operations
} from './openapi/generated/types'

export type AccessLimits =
  external['schemas.yaml']['components']['schemas']['limits-outgoing']
export type IntrospectArgs =
  operations['post-introspect']['requestBody']['content']['application/json']
export type TokenInfo =
  operations['post-introspect']['responses']['200']['content']['application/json']
// export type ActiveTokenInfo = components['schemas']['token-info']

// export const isActiveTokenInfo = (
//   tokenInfo: TokenInfo
// ): tokenInfo is ActiveTokenInfo => tokenInfo.active
