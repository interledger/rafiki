/* eslint-disable @typescript-eslint/no-explicit-any */
import { extractHeader } from '../httpbis'
import { DigestAlgorithm, RequestLike } from '../types'
import { createHash } from 'crypto'

/**
 * Implementation of functions to assist with HTTP Content Digest headers per
 * https://www.ietf.org/archive/id/draft-ietf-httpbis-digest-headers-10.txt
 *
 * Supported algorithms
 *
 * +===========+==========+============================+==============+
 * | Algorithm | Status   | Description                | Reference(s) |
 * | Key       |          |                            |              |
 * +===========+==========+============================+==============+
 * | sha-512   | standard | The SHA-512 algorithm.     | [RFC6234],   |
 * |           |          |                            | [RFC4648]    |
 * +-----------+----------+----------------------------+--------------+
 * | sha-256   | standard | The SHA-256 algorithm.     | [RFC6234],   |
 * |           |          |                            | [RFC4648]    |
 * +-----------+----------+----------------------------+--------------+
 *
 */

function nodeAlgo(algorithm: string): string {
  switch (algorithm) {
    case 'sha-256':
      return 'sha256'
    case 'sha-512':
      return 'sha512'
    default:
      throw new Error(`Unsupported digest algorithm ${algorithm}.`)
  }
}

export function createContentDigestHeader(
  body: string | Buffer | undefined,
  algorithms: DigestAlgorithm[]
): string {
  return algorithms
    .map((algo) => {
      return `${algo}=:${createHash(nodeAlgo(algo))
        .update(body || '')
        .digest('base64')}:`
    })
    .join(', ')
}

export function verifyContentDigest(request: RequestLike) {
  const digestHeaderString = extractHeader(request, 'content-digest')
  if (!digestHeaderString) {
    throw new Error('No content-digest header in request.')
  }

  const digests = digestHeaderString.split(',')
  return digests
    .map(async (digestHeader) => {
      const [key, value] = digestHeader.split('=')
      if (!value.startsWith(':') || !value.endsWith(':')) {
        throw new Error('Error parsing digest value')
      }
      const digest = value.substring(1, value.length - 1)
      const hash = createHash(nodeAlgo(key.trim()))
        .update((request as any).body || '')
        .digest('base64')
      return digest === hash
    })
    .every((isValid) => isValid)
}
