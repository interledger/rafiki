export * from './remote'
export type IntrospectFunction = (token: string) => Promise<TokenInfo>

export interface TokenService {
  /**
   * Introspect a token
   */
  introspect: IntrospectFunction

  /**
   * Lookup a token given data about it
   */
  lookup: (tokenInfo: TokenInfo) => Promise<string | undefined>

  /**
   * Store token info for a token
   */
  store: (token: string, tokenInfo: TokenInfo) => Promise<void>

  /**
   * Store token info for a token
   */
  delete: (tokenOrtokenInfo: TokenInfo | string) => Promise<void>

  /**
   * Create a new token
   */
  create: (tokenInfo: TokenInfo) => Promise<string>
}

/**
 * An implementation of an RFC 7662 token introspection response
 */
export interface TokenInfo {
  /**
   * REQUIRED.  Boolean indicator of whether or not the presented token
   * is currently active.  The specifics of a token's "active" state
   * will vary depending on the implementation of the authorization
   * server and the information it keeps about its tokens, but a "true"
   * value return for the "active" property will generally indicate
   * that a given token has been issued by this authorization server,
   * has not been revoked by the resource owner, and is within its
   * given time window of validity (e.g., after its issuance time and
   * before its expiration time).  See Section 4 for information on
   * implementation of such checks.
   */
  active: boolean

  /**
   * OPTIONAL.  A JSON string containing a space-separated list of
   * scopes associated with this token, in the format described in
   * Section 3.3 of OAuth 2.0 [RFC6749].
   */
  scope?: string

  /**
   * OPTIONAL.  Client identifier for the OAuth 2.0 client that
   * requested this token.
   */
  client_id?: string

  /**
   * OPTIONAL.  Human-readable identifier for the resource owner who
   * authorized this token.
   */
  username?: string

  /**
   * OPTIONAL.  Type of the token as defined in Section 5.1 of OAuth
   * 2.0 [RFC6749].
   */
  token_type?: string

  /**
   * OPTIONAL.  Integer timestamp, measured in the number of seconds
   * since January 1 1970 UTC, indicating when this token will expire,
   * as defined in JWT [RFC7519].
   */
  exp?: number

  /**
   * OPTIONAL.  Integer timestamp, measured in the number of seconds
   * since January 1 1970 UTC, indicating when this token was
   * originally issued, as defined in JWT [RFC7519].
   */
  iat?: number

  /**
   * OPTIONAL.  Integer timestamp, measured in the number of seconds
   * since January 1 1970 UTC, indicating when this token is not to be
   * used before, as defined in JWT [RFC7519].
   */
  nbf?: number

  /**
   * OPTIONAL.  Subject of the token, as defined in JWT [RFC7519].
   * Usually a machine-readable identifier of the resource owner who
   * authorized this token.
   */
  sub?: string

  /**
   * OPTIONAL.  Service-specific string identifier or list of string
   * identifiers representing the intended audience for this token, as
   * defined in JWT [RFC7519].
   */
  aud?: string

  /**
   * OPTIONAL.  String representing the issuer of this token, as
   * defined in JWT [RFC7519].
   */
  iss?: string

  /**  OPTIONAL.  String identifier for the token, as defined in JWT
   * [RFC7519].
   */
  jti?: string
}
