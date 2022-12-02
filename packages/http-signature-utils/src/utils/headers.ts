import { createContentDigestHeader } from 'httpbis-digest-headers'
import {
  createSignatureHeaders,
  SignatureHeaders,
  SignOptions
} from './signatures'

interface ContentHeaders {
  'Content-Digest': string
  'Content-Length': number
  'Content-Type': string
}

interface Headers extends SignatureHeaders, Partial<ContentHeaders> {}

const createContentHeaders = (body: string | Buffer): ContentHeaders => {
  const data = JSON.stringify(body)
  return {
    'Content-Digest': createContentDigestHeader(data, ['sha-512']),
    'Content-Length': Buffer.from(data, 'utf-8').length,
    'Content-Type': 'application/json'
  }
}

export const createHeaders = async ({
  request,
  privateKey,
  keyId
}: SignOptions): Promise<Headers> => {
  let headers = {}
  if (request.body) {
    headers = createContentHeaders(request.body)
    request.headers = { ...request.headers, ...headers }
  }
  const signatureHeaders = await createSignatureHeaders({
    request,
    privateKey,
    keyId
  })
  return { ...headers, ...signatureHeaders }
}
