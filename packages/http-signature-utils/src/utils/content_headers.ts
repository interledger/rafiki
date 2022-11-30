import { createContentDigestHeader } from 'httpbis-digest-headers'

interface ContentHeaders {
  'Content-Digest': string
  'Content-Length': number
  'Content-Type': string
}

export const createContentHeaders = (
  body: Record<string, unknown>
): ContentHeaders => {
  const data = JSON.stringify(body)
  return {
    'Content-Digest': createContentDigestHeader(data, ['sha-512']),
    'Content-Length': Buffer.from(data, 'utf-8').length,
    'Content-Type': 'application/json'
  }
}
