export const createHttpUrl = (
  rawUrl: string,
  base?: string
): URL | undefined => {
  try {
    const url = new URL(rawUrl, base)
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      return url
    }
  } catch (_) {
    return
  }
}

/** URL of a unique account payable over Interledger, queryable via SPSP or Open Payments */
export class AccountUrl {
  private static DEFAULT_PATH = '/.well-known/pay'

  /** Protocol of the URL */
  private protocol: string

  /** Domain name of the URL */
  private hostname: string

  /** Path with stripped trailing slash, or `undefined` for default, well-known account path */
  private path?: string

  /** Query string and/or fragment. Empty string for PP, optional for the full URL format */
  private suffix: string

  /** Parse a [payment pointer](https://paymentpoiners.org) prefixed with "$" */
  static fromPaymentPointer(paymentPointer: string): AccountUrl | undefined {
    if (!paymentPointer.startsWith('$')) {
      return
    }

    /**
     * From paymentpointers.org/syntax-resolution/:
     *
     * "...the Payment Pointer syntax only supports a host which excludes the userinfo and port.
     * The Payment Pointer syntax also excludes the query and fragment parts that are allowed in the URL syntax.
     *
     * Payment Pointers that do not meet the limited syntax of this profile MUST be
     * considered invalid and should not be used to resolve a URL."
     */
    const url = createHttpUrl('https://' + paymentPointer.substring(1))
    if (
      !url || // URL was invalid
      url.username !== '' ||
      url.password !== '' ||
      url.port !== '' ||
      url.search !== '' || // No query params
      url.hash !== '' // No fragment
    ) {
      return
    }

    return new AccountUrl(url)
  }

  /** Parse SPSP/Open Payments account URL. Must be HTTPS/HTTP, contain no credentials, and no port. */
  static fromUrl(rawUrl: string): AccountUrl | undefined {
    const url = createHttpUrl(rawUrl)
    if (!url || url.username !== '' || url.password !== '' || url.port !== '') {
      return
    }

    // Don't error if query string or fragment is included -- allowed from URL format
    return new AccountUrl(url)
  }

  private constructor(url: URL) {
    this.protocol = url.protocol
    this.hostname = url.hostname

    // Strip trailing slash. If empty, `URL` still adds back the initial slash
    const pathname = url.pathname.replace(/\/$/, '')

    // Don't set the path if it corresponds to the default
    if (!(pathname === '' || pathname === AccountUrl.DEFAULT_PATH)) {
      this.path = pathname
    }

    // Empty for payment pointers (fails), optional for full URL variant
    this.suffix = url.search + url.hash
  }

  /** Endpoint URL for SPSP queries to the account. Includes query string and/or fragment */
  toEndpointUrl(): string {
    return (
      this.protocol +
      '//' +
      this.hostname +
      (this.path ?? AccountUrl.DEFAULT_PATH) +
      this.suffix
    )
  }

  /** Endpoint URL for SPSP queries to the account. Excludes query string and/or fragment */
  toBaseUrl(): string {
    return (
      this.protocol +
      '//' +
      this.hostname +
      (this.path ?? AccountUrl.DEFAULT_PATH)
    )
  }

  /**
   * SPSP/Open Payments account URL, identifying a unique account. Use this for comparing sameness between
   * accounts.
   */
  toString(): string {
    return this.toEndpointUrl()
  }

  /**
   * Unique payment pointer for this SPSP or Open Payments account. Stripped trailing slash.
   * Returns undefined when the protocol is not "https".
   * Returns undefined when there is a query string or fragment.
   */
  toPaymentPointer(): string | undefined {
    if (this.protocol !== 'https:' || this.suffix !== '') return
    return '$' + this.hostname + (this.path ?? '')
  }
}
