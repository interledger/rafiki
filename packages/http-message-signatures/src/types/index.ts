import {
  Parameters as StructuredDataParameters,
  Item as StructuredDataItem
} from 'structured-headers'
import { Algorithm, Signer, Verifier } from '../algorithm'

type HttpLike = {
  method: string
  url: string
  headers: Record<
    string,
    { toString(): string } | string | string[] | undefined
  >
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  body?: { [key: string]: any } | string | undefined
}

export type RequestLike = HttpLike

export type ResponseLike = HttpLike & {
  status: number
}

// see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-06#section-2.3.1
export type Parameter =
  | 'created'
  | 'expires'
  | 'nonce'
  | 'alg'
  | 'keyid'
  | string

export type Component =
  | '@method'
  | '@target-uri'
  | '@authority'
  | '@scheme'
  | '@request-target'
  | '@path'
  | '@query'
  | '@query-params'
  | string

export type ResponseComponent = '@status' | '@request-response' | Component

export type Parameters = {
  [name: Parameter]:
    | string
    | number
    | Date
    | { [Symbol.toStringTag]: () => string }
}

export type DigestAlgorithm = 'sha-256' | 'sha-512'

type CommonOptions = {
  format: 'httpbis' | 'cavage'
}

export type ParsedSignature = {
  input: {
    components: StructuredDataItem[]
    parameters: StructuredDataParameters
  }
  value: Buffer
  components: Component[]
  signatureParams: string
  alg?: Algorithm
  created?: Date
  expires?: Date
  keyid?: string
  nonce?: string
}

export type SignOptions = CommonOptions & {
  components?: Component[]
  parameters?: Parameters
  allowMissingHeaders?: boolean
  keyId: string
  contentDigests?: DigestAlgorithm[]
  signer: Signer
}

export type VerifyOptions = CommonOptions & {
  verifiers: { [keyid: string]: Verifier }
}

export type HeaderExtractionOptions = {
  allowMissing: boolean
}
