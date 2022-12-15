import { createContentDigestHeader } from 'httpbis-digest-headers'
import {
  createSignatureHeaders,
  SignatureHeaders,
  SignOptions
} from './signatures'

interface ContentHeaders {
  'Content-Digest': string
  'Content-Length': string
  'Content-Type': string
}

export interface Headers extends SignatureHeaders, Partial<ContentHeaders> {}

const createContentHeaders = (body: string): ContentHeaders => {
  return {
    'Content-Digest': createContentDigestHeader(
      JSON.stringify(JSON.parse(body)),
      ['sha-512']
    ),
    'Content-Length': Buffer.from(body as string, 'utf-8').length.toString(),
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
      ...contentHeaders,
      ...signatureHeaders
    }
  } else {
    return signatureHeaders
  }
}
