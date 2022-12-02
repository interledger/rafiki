import { createContentDigestHeader } from 'httpbis-digest-headers'
import {
  createSignatureHeaders,
  SignatureHeaders,
  SignOptions
} from './signatures'

interface Headers extends SignatureHeaders {
  'Content-Digest'?: string
}

export const createHeaders = async ({
  request,
  privateKey,
  keyId
}: SignOptions): Promise<Headers> => {
  const headers = {}
  if (request.body) {
    const data = JSON.stringify(request.body)
    headers['Content-Digest'] = createContentDigestHeader(data, ['sha-512'])
    request.headers = { ...request.headers, ...headers }
  }
  const signatureHeaders = await createSignatureHeaders({
    request,
    privateKey,
    keyId
  })
  return { ...headers, ...signatureHeaders }
}
