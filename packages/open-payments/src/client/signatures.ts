import { KeyLike } from 'crypto'
import {
  createSigner,
  createVerifier,
  httpbis,
  Request
} from 'http-message-signatures'
// TODO: use generated type
import { importJWK, JWK } from 'jose'

export interface SignRequest extends Request {
  body?: string
}

export interface SignOptions {
  request: SignRequest
  privateKey: KeyLike
  keyId: string
}

export interface VerifyOptions {
  request: SignRequest
  paymentPointer: string
  jwks: JWK[]
}

interface SignatureHeaders {
  Signature: string
  'Signature-Input': string
}

const ALG = 'ed25519'
const PARAMS = ['created', 'keyid']

const getRequestFields = (request: SignRequest): string[] => {
  const fields = ['@method', '@target-uri']
  if (request.headers['Authorization']) {
    fields.push('authorization')
  }
  if (request.body) {
    // TODO: 'content-digest'
    // https://github.com/interledger/rafiki/issues/655
    fields.push('content-length', 'content-type')
  }
  return fields
}

export const createSignatureHeaders = async ({
  request,
  privateKey,
  keyId
}: SignOptions): Promise<SignatureHeaders> => {
  const { headers } = await httpbis.signMessage(
    {
      fields: getRequestFields(request),
      name: 'sig1',
      params: PARAMS,
      key: createSigner(privateKey, ALG, keyId)
    },
    request
  )
  return {
    Signature: headers['Signature'] as string,
    'Signature-Input': headers['Signature-Input'] as string
  }
}

export const verifySignatureHeaders = async ({
  request,
  jwks
}: VerifyOptions): Promise<boolean> => {
  return !!(await httpbis.verifyMessage(
    {
      requiredFields: getRequestFields(request),
      requiredParams: PARAMS,
      keyLookup: async ({ keyid }) => {
        if (!keyid) {
          return null
        }
        const key = jwks.find((key) => key.kid === keyid && key.alg === ALG)
        return key
          ? {
              verify: createVerifier((await importJWK(key)) as KeyLike, ALG)
            }
          : null
      }
    },
    request
  ))
}
