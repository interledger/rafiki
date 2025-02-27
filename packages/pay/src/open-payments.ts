/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types, @typescript-eslint/no-empty-function */
import { Int, isNonNegativeRational, sleep } from './utils'
import fetch, { Response, RequestInit } from 'node-fetch'
import { PaymentError, SetupOptions } from '.'
import createLogger from 'ilp-logger'
import { AssetDetails, isValidAssetScale, isValidAssetDetails } from './controllers/asset-details'
import { IlpAddress, isValidIlpAddress } from 'ilp-packet'
import AbortController from 'abort-controller'
import { AccountUrl, createHttpUrl } from './payment-pointer'

const SHARED_SECRET_BYTE_LENGTH = 32
const OPEN_PAYMENT_QUERY_ACCEPT_HEADER = 'application/json'
const ACCOUNT_QUERY_ACCEPT_HEADER = `${OPEN_PAYMENT_QUERY_ACCEPT_HEADER}, application/spsp4+json`

const log = createLogger('ilp-pay:query')

/**
 * Destination details of the payment, such the asset, Incoming Payment, and STREAM credentials to
 * establish an authenticated connection with the receiver
 */
export interface PaymentDestination {
  /** 32-byte seed to derive keys to encrypt STREAM messages and generate ILP packet fulfillments */
  sharedSecret: Buffer
  /** ILP address of the recipient, identifying this connection, which is used to send packets to their STREAM server */
  destinationAddress: IlpAddress
  /** Asset and denomination of the receiver's Interledger account */
  destinationAsset?: AssetDetails
  /** Open Payments Incoming Payment metadata, if the payment pays into an Incoming Payment */
  destinationPaymentDetails?: IncomingPayment
  /**
   * URL of the recipient Open Payments/SPSP account (with well-known path, and stripped trailing slash).
   * Each payment pointer and its corresponding account URL identifies a unique payment recipient.
   * Not applicable if STREAM credentials were provided directly.
   */
  accountUrl?: string
  /**
   * Payment pointer, prefixed with "$", corresponding to the recipient Open Payments/SPSP account.
   * Each payment pointer and its corresponding account URL identifies a unique payment recipient.
   * Not applicable if STREAM credentials were provided directly.
   */
  destinationAccount?: string
}

/** [Open Payments Account](https://docs.openpayments.guide) metadata */
export interface Account {
  /** URL identifying the Account */
  id: string
  /** A public name for the account */
  publicName: string
  /** Asset code or symbol identifying the currency of the account */
  assetCode: string
  /** Precision of the asset denomination: number of decimal places of the normal unit */
  assetScale: number
  /** The URL of the authorization server endpoint for getting grants and access tokens for this account **/
  authServer: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isAccount = (o: any): o is Account => !!validateOpenPaymentsAccount(o)

/** [Open Payments Incoming Payment](https://docs.openpayments.guide) metadata */
export interface IncomingPayment {
  /** URL identifying the Incoming Payment */
  id: string
  /** URL identifying the account into which payments toward the Incoming Payment will be credited */
  paymentPointer: string
  /** Describes whether the Incoming Payment has completed receiving funds */
  completed: boolean
  /** UNIX timestamp in milliseconds when payments toward the Incoming Payment will no longer be accepted */
  expiresAt?: number
  /** Human-readable description of the Incoming Payment */
  description?: string
  /** Human-readable external reference of the Incoming Payment */
  externalRef?: string
  /** Fixed destination amount that must be delivered to complete payment of the Incoming Payment. */
  incomingAmount?: Amount
  /** Amount that has already been paid toward the Incoming Payment. */
  receivedAmount: Amount
}

export interface Amount {
  // Amount, in base units. ≥0
  value: bigint
  /** Asset code or symbol identifying the currency of the account */
  assetCode: string
  /** Precision of the asset denomination: number of decimal places of the normal unit */
  assetScale: number
}

/** Validate and resolve the details provided by recipient to execute the payment */
export const fetchPaymentDetails = async (
  options: Partial<SetupOptions>
): Promise<PaymentDestination | PaymentError> => {
  const {
    destinationPayment,
    destinationConnection,
    destinationAccount,
    sharedSecret,
    destinationAddress,
    destinationAsset,
  } = options

  // Check that only one of destinationPayment, destinationConnection, destinationAccount, or STREAM credentials are provided
  if (
    Object.values({
      destinationPayment,
      destinationConnection,
      destinationAccount,
      destinationAddress,
    }).filter((e) => e !== undefined).length > 1
  ) {
    log.debug(
      'invalid config: more that one of destinationPayment, destinationConnection, destinationAccount, or STREAM credentials provided'
    )
    return PaymentError.InvalidDestination
  }

  // Resolve Incoming Payment and STREAM credentials
  if (destinationPayment) {
    return queryIncomingPayment(destinationPayment)
  }
  // Resolve STREAM credentials from Open Payments Connection URL
  else if (destinationConnection) {
    return queryConnection(destinationConnection)
  }
  // Resolve STREAM credentials from SPSP query at payment pointer
  else if (destinationAccount) {
    const account = await queryAccount(destinationAccount)
    if (isAccount(account)) {
      return PaymentError.InvalidDestination
    } else {
      return account
    }
  }
  // STREAM credentials were provided directly
  else if (
    isSharedSecretBuffer(sharedSecret) &&
    isValidIlpAddress(destinationAddress) &&
    (!destinationAsset || isValidAssetDetails(destinationAsset))
  ) {
    log.warn(
      'using custom STREAM credentials. destinationPayment or destinationAccount are recommended to setup a STREAM payment'
    )
    return {
      sharedSecret,
      destinationAddress,
      destinationAsset,
    }
  }
  // No STREAM credentials or method to resolve them
  else {
    log.debug(
      'invalid config: no destinationPayment, destinationConnection, destinationAccount, or STREAM credentials provided'
    )
    return PaymentError.InvalidCredentials
  }
}

/** Fetch an Incoming Payment and STREAM credentials from an Open Payments account */
const queryIncomingPayment = async (url: string): Promise<PaymentDestination | PaymentError> => {
  if (!createHttpUrl(url)) {
    log.debug('destinationPayment query failed: URL not HTTP/HTTPS.')
    return PaymentError.QueryFailed
  }

  return fetchJson(url, OPEN_PAYMENT_QUERY_ACCEPT_HEADER)
    .then(async (data) => {
      const credentials = await validateOpenPaymentsCredentials(data)
      const incomingPayment = validateOpenPaymentsIncomingPayment(data)

      if (incomingPayment && credentials) {
        return {
          accountUrl: incomingPayment.paymentPointer,
          destinationPaymentDetails: incomingPayment,
          ...credentials,
        }
      }
      log.debug('destinationPayment query returned an invalid response.')
    })
    .catch((err) => log.debug('destinationPayment query failed: %s', err?.message))
    .then((res) => res || PaymentError.QueryFailed)
}

/** Query the payment pointer, Open Payments server, or SPSP server for credentials to establish a STREAM connection */
export const queryAccount = async (
  destinationAccount: string
): Promise<Account | PaymentDestination | PaymentError> => {
  const accountUrl =
    AccountUrl.fromPaymentPointer(destinationAccount) ?? AccountUrl.fromUrl(destinationAccount)
  if (!accountUrl) {
    log.debug('payment pointer or account url is invalid: %s', destinationAccount)
    return PaymentError.InvalidPaymentPointer
  }

  return fetchJson(accountUrl.toEndpointUrl(), ACCOUNT_QUERY_ACCEPT_HEADER)
    .then(
      (data) =>
        validateOpenPaymentsAccount(data) ??
        validateSpspCredentials(data) ??
        log.debug('payment pointer query returned no valid STREAM credentials.')
    )
    .catch((err) => log.debug('payment pointer query failed: %s', err))
    .then((res) =>
      res
        ? isAccount(res)
          ? res
          : {
              ...res,
              accountUrl: accountUrl.toString(),
              destinationAccount: accountUrl.toPaymentPointer(),
            }
        : PaymentError.QueryFailed
    )
}

/** Query an Open Payments Connection endpoint for STREAM credentials*/
const queryConnection = async (url: string): Promise<PaymentDestination | PaymentError> => {
  if (!createHttpUrl(url)) {
    log.debug('destinationPayment query failed: URL not HTTP/HTTPS.')
    return PaymentError.QueryFailed
  }
  return fetchJson(url, OPEN_PAYMENT_QUERY_ACCEPT_HEADER)
    .then(
      (data) =>
        validateConnectionCredentials(data) ??
        log.debug('payment pointer query returned no valid STREAM credentials.')
    )
    .catch((err) => log.debug('payment pointer query failed: %s', err))
    .then((res) => (res ? res : PaymentError.QueryFailed))
}

/** Perform an HTTP request using `fetch` with timeout and retries. Resolve with parsed JSON, reject otherwise. */
const fetchJson = async (
  url: string,
  acceptHeader: string,
  timeout = 3000,
  remainingRetries = [10, 500, 2500] // Retry up to 3 times with increasing backoff
): Promise<any> => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)

  const retryDelay = remainingRetries.shift()

  return fetch(url, {
    redirect: 'follow',
    headers: {
      Accept: acceptHeader,
    },
    // @types/node-fetch isn't compatible with abort-controller
    signal: controller.signal as RequestInit['signal'],
  })
    .then(
      async (res: Response) => {
        // If server error, retry after delay
        if ((res.status >= 500 || res.status === 429) && retryDelay) {
          await sleep(retryDelay)
          return fetchJson(url, acceptHeader, timeout, remainingRetries)
        }

        // Parse JSON on HTTP 2xx, otherwise error
        return res.ok ? res.json() : Promise.reject()
      },
      async (err: Error) => {
        // Only handle timeout (abort) errors. Use two `then` callbacks instead
        // of then/catch so JSON parsing errors, etc. are not caught here.
        if (err.name !== 'AbortError' && retryDelay) {
          await sleep(retryDelay)
          return fetchJson(url, acceptHeader, timeout, remainingRetries)
        }

        throw err
      }
    )
    .finally(() => clearTimeout(timer))
}

const validateSharedSecretBase64 = (o: any): Buffer | undefined => {
  if (typeof o === 'string') {
    const sharedSecret = Buffer.from(o, 'base64')
    if (sharedSecret.byteLength === SHARED_SECRET_BYTE_LENGTH) {
      return sharedSecret
    }
  }
}

const isSharedSecretBuffer = (o: any): o is Buffer =>
  Buffer.isBuffer(o) && o.byteLength === SHARED_SECRET_BYTE_LENGTH

/** Validate the input is a number or string in the range of a u64 integer, and transform into `Int` */
const validateUInt64 = (o: any): Int | undefined => {
  if (!['string', 'number'].includes(typeof o)) {
    return
  }

  const n = Int.from(o)
  if (n?.isLessThanOrEqualTo(Int.MAX_U64)) {
    return n
  }
}

const isNonNullObject = (o: any): o is Record<string, any> => typeof o === 'object' && o !== null

/** Transform the Open Payments server response into a validated Account */
const validateOpenPaymentsAccount = (o: any): Account | undefined => {
  if (!isNonNullObject(o)) {
    return
  }

  const { id, publicName, assetCode, assetScale, authServer } = o

  if (
    typeof id !== 'string' ||
    !(typeof publicName === 'string' || publicName === undefined) ||
    typeof assetCode !== 'string' ||
    !isValidAssetScale(assetScale) ||
    typeof authServer !== 'string'
  ) {
    return
  }

  if (!AccountUrl.fromUrl(id)) return

  // TODO Should the given Account URL be validated against the `id` URL in the Account itself?

  return {
    id,
    publicName,
    assetCode,
    assetScale,
    authServer,
  }
}

/** Transform the Open Payments server response into a validated IncomingPayment */
const validateOpenPaymentsIncomingPayment = (
  o: any,
  expectedAmount?: Amount
): IncomingPayment | undefined => {
  if (!isNonNullObject(o)) {
    return
  }

  const {
    id,
    paymentPointer,
    completed,
    incomingAmount: unvalidatedIncomingAmount,
    receivedAmount: unvalidatedReceivedAmount,
    expiresAt: expiresAtIso,
    description,
    externalRef,
  } = o
  const expiresAt = expiresAtIso ? Date.parse(expiresAtIso) : undefined // `NaN` if date is invalid
  const incomingAmount = validateOpenPaymentsAmount(unvalidatedIncomingAmount)
  const receivedAmount = validateOpenPaymentsAmount(unvalidatedReceivedAmount)

  if (
    typeof id !== 'string' ||
    typeof paymentPointer !== 'string' ||
    typeof completed !== 'boolean' ||
    !(typeof description === 'string' || description === undefined) ||
    !(typeof externalRef === 'string' || externalRef === undefined) ||
    !(isNonNegativeRational(expiresAt) || expiresAt === undefined) ||
    incomingAmount === null ||
    !receivedAmount
  ) {
    return
  }

  if (expectedAmount) {
    if (
      incomingAmount?.value !== expectedAmount.value ||
      incomingAmount?.assetCode !== expectedAmount.assetCode ||
      incomingAmount?.assetScale !== expectedAmount.assetScale
    ) {
      return
    }
  }

  if (!AccountUrl.fromUrl(id)) return
  if (!AccountUrl.fromUrl(paymentPointer)) return

  // TODO Should the given Incoming Payment URL be validated against the `id` URL in the Incoming Payment itself?

  return {
    id,
    paymentPointer,
    completed,
    expiresAt,
    description,
    externalRef,
    receivedAmount,
    incomingAmount,
  }
}

/** Validate Open Payments STREAM credentials and asset details */
const validateOpenPaymentsCredentials = async (o: any): Promise<PaymentDestination | undefined> => {
  if (!isNonNullObject(o)) {
    return
  }

  const { ilpStreamConnection, receivedAmount } = o
  if (!receivedAmount) return
  let details
  if (typeof ilpStreamConnection === 'string') {
    details = await fetchJson(ilpStreamConnection, OPEN_PAYMENT_QUERY_ACCEPT_HEADER)
  } else {
    details = ilpStreamConnection
  }
  const { ilpAddress: destinationAddress, sharedSecret: sharedSecretBase64 } = details
  const sharedSecret = validateSharedSecretBase64(sharedSecretBase64)
  const destinationAmount = validateOpenPaymentsAmount(receivedAmount)
  if (!sharedSecret || !isValidIlpAddress(destinationAddress) || !destinationAmount) {
    return
  }

  return {
    destinationAsset: { code: destinationAmount.assetCode, scale: destinationAmount.assetScale },
    destinationAddress,
    sharedSecret,
  }
}

/** Validate and transform the SPSP server response into STREAM credentials */
const validateSpspCredentials = (o: any): PaymentDestination | undefined => {
  if (!isNonNullObject(o)) {
    return
  }

  const { destination_account: destinationAddress, shared_secret } = o
  const sharedSecret = validateSharedSecretBase64(shared_secret)
  if (sharedSecret && isValidIlpAddress(destinationAddress)) {
    return { destinationAddress, sharedSecret }
  }
}

/** Validate and transform the Open Payments connection endpoint response into STREAM credentials */
const validateConnectionCredentials = (o: any): PaymentDestination | undefined => {
  if (!isNonNullObject(o)) {
    return
  }

  const { ilpAddress: destinationAddress, sharedSecret: sharedSecretBase64 } = o
  const sharedSecret = validateSharedSecretBase64(sharedSecretBase64)
  if (sharedSecret && isValidIlpAddress(destinationAddress)) {
    return { destinationAddress, sharedSecret }
  }
}

const validateOpenPaymentsAmount = (o: Record<string, any>): Amount | undefined | null => {
  if (o === undefined) return undefined
  const { value, assetScale, assetCode } = o
  const amountInt = validateUInt64(value)
  if (amountInt && isValidAssetScale(assetScale) && typeof assetCode === 'string') {
    return { value: amountInt.value, assetCode, assetScale }
  } else {
    return null
  }
}
