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

interface Headers extends SignatureHeaders {
  'Content-Digest'?: string
}

const createContentHeaders = (body: string): ContentHeaders => {
  return {
    'Content-Digest': createContentDigestHeader(body.replace(/[\s\r]/g, ''), [
      'sha-512'
    ]),
    'Content-Length': Buffer.from(body as string, 'utf-8').length,
    'Content-Type': 'application/json'
  }
}

export const createHeaders = async ({
  request,
  privateKey,
  keyId
}: SignOptions): Promise<Headers> => {
  let contentHeaders: ContentHeaders
  if (request.body) {
    contentHeaders = createContentHeaders(request.body as string)
    request.headers = { ...request.headers, ...contentHeaders }
  }
  const signatureHeaders = await createSignatureHeaders({
    request,
    privateKey,
    keyId
  })
  if (contentHeaders) {
    return {
      'Content-Digest': contentHeaders['Content-Digest'],
      ...signatureHeaders
    }
  } else {
    return signatureHeaders
  }
}
