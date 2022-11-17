import { KeyLike } from 'crypto'
import { createSigner, httpbis, Request } from 'http-message-signatures'

export interface SignOptions {
  request: Request & {
    body?: string
  }
  privateKey: KeyLike
  keyId: string
}

interface SignatureHeaders {
  Signature: string
  'Signature-Input': string
}

export const createSignatureHeaders = async ({
  request,
  privateKey,
  keyId
}: SignOptions): Promise<SignatureHeaders> => {
  const fields = ['@method', '@target-uri']
  if (request.headers['Authorization']) {
    fields.push('authorization')
  }
  if (request.body) {
    // TODO: 'content-digest'
    // https://github.com/interledger/rafiki/issues/655
    fields.push('content-length', 'content-type')
  }
  const { headers } = await httpbis.signMessage(
    {
      fields,
      name: 'sig1',
      params: ['created', 'keyid'],
      key: createSigner(privateKey, 'ed25519', keyId)
    },
    request
  )
  return {
    Signature: headers['Signature'] as string,
    'Signature-Input': headers['Signature-Input'] as string
  }
}
