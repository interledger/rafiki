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

function bodyToString(request: RequestLike): string {
  if (request.body) {
    if (typeof request.body === 'string') {
      return request.body
    } else {
      // JSON
      return JSON.stringify(request.body)
    }
  } else {
    return ''
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
    .map((digestHeader) => {
      /**
       * the expected format is:
       *    <optional whitespace><key><optional whitespace>=<optional whitespace><value><optional whitespace>
       * where
       *    <optional whitespace> contains only spaces and tabs or no characters at all
       *    <key> contains only lowercase a-z chars, asterisks and hyphens (the 1st character cannot be a hyphen)
       *    <value> contains only base64 characters and is surrounded with colons on either side
       */
      const [, key, value] =
        digestHeader.match(
          /^[\s]{0,}([a-z*][a-z*0-9-]{1,})[\s]{0,}=[\s]{0,}(:[A-Za-z0-9+/=]{1,}:)[\s]{0,}$/
        ) || []
      if (!key || !value || !value.startsWith(':') || !value.endsWith(':')) {
        throw new Error('Error parsing digest value')
      }
      const digest = value.substring(1, value.length - 1)
      const hash = createHash(nodeAlgo(key.trim()))
        .update(bodyToString(request))
        .digest('base64')
      return digest === hash
    })
    .every((isValid) => isValid)
}
