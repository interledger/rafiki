import {
  Component,
  HeaderExtractionOptions,
  Parameters,
  RequestLike,
  ResponseLike,
  SignOptions
} from '../types'
import { URL } from 'url'

export const defaultSigningComponents: Component[] = [
  '@request-target',
  'content-type',
  'digest',
  'content-digest'
]

export function extractHeader(
  { headers }: RequestLike | ResponseLike,
  header: string,
  opts?: HeaderExtractionOptions
): string {
  const lcHeader = header.toLowerCase()
  const key = Object.keys(headers).find(
    (name) => name.toLowerCase() === lcHeader
  )
  const allowMissing = opts?.allowMissing ?? true
  if (!allowMissing && !key) {
    throw new Error(`Unable to extract header "${header}" from message`)
  }
  let val = key ? headers[key] ?? '' : ''
  if (Array.isArray(val)) {
    val = val.join(', ')
  }
  return val.toString().replace(/\s+/g, ' ')
}

// see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-06#section-2.3
export function extractComponent(
  message: RequestLike | ResponseLike,
  component: string
): string {
  switch (component) {
    case '@request-target': {
      const { pathname, search } = new URL(message.url)
      return `${message.method.toLowerCase()} ${pathname}${search}`
    }
    default:
      throw new Error(`Unknown specialty component ${component}`)
  }
}

const ALG_MAP: { [name: string]: string } = {
  'rsa-v1_5-sha256': 'rsa-sha256'
}

export function buildSignedData(
  request: RequestLike,
  components: Component[],
  params: Parameters
): string {
  const payloadParts: Parameters = {}
  const paramNames = Object.keys(params)
  if (components.includes('@request-target')) {
    Object.assign(payloadParts, {
      '(request-target)': extractComponent(request, '@request-target')
    })
  }
  if (paramNames.includes('created')) {
    Object.assign(payloadParts, {
      '(created)': params.created
    })
  }
  if (paramNames.includes('expires')) {
    Object.assign(payloadParts, {
      '(expires)': params.expires
    })
  }
  components.forEach((name) => {
    if (!name.startsWith('@')) {
      Object.assign(payloadParts, {
        [name.toLowerCase()]: extractHeader(request, name)
      })
    }
  })
  return Object.entries(payloadParts)
    .map(([name, value]) => {
      if (value instanceof Date) {
        return `${name}: ${Math.floor(value.getTime() / 1000)}`
      } else {
        return `${name}: ${value.toString()}`
      }
    })
    .join('\n')
}

export function buildSignatureInputString(
  componentNames: Component[],
  parameters: Parameters
): string {
  const params: Parameters = Object.entries(parameters).reduce(
    (normalised, [name, value]) => {
      switch (name.toLowerCase()) {
        case 'keyid':
          return Object.assign(normalised, {
            keyId: value
          })
        case 'alg':
          return Object.assign(normalised, {
            algorithm: ALG_MAP[value as string] ?? value
          })
        default:
          return Object.assign(normalised, {
            [name]: value
          })
      }
    },
    {}
  )
  const headers = []
  const paramNames = Object.keys(params)
  if (componentNames.includes('@request-target')) {
    headers.push('(request-target)')
  }
  if (paramNames.includes('created')) {
    headers.push('(created)')
  }
  if (paramNames.includes('expires')) {
    headers.push('(expires)')
  }
  componentNames.forEach((name) => {
    if (!name.startsWith('@')) {
      headers.push(name.toLowerCase())
    }
  })
  return `${Object.entries(params)
    .map(([name, value]) => {
      if (typeof value === 'number') {
        return `${name}=${value}`
      } else if (value instanceof Date) {
        return `${name}=${Math.floor(value.getTime() / 1000)}`
      } else {
        return `${name}="${value.toString()}"`
      }
    })
    .join(',')},headers="${headers.join(' ')}"`
}

// @todo - should be possible to sign responses too
export async function sign(
  request: RequestLike,
  opts: SignOptions
): Promise<RequestLike> {
  const signingComponents: Component[] =
    opts.components ?? defaultSigningComponents
  const signingParams: Parameters = {
    ...opts.parameters,
    keyid: opts.keyId,
    alg: opts.signer.alg
  }
  const signatureInputString = buildSignatureInputString(
    signingComponents,
    signingParams
  )
  const dataToSign = buildSignedData(request, signingComponents, signingParams)
  const signature = await opts.signer(Buffer.from(dataToSign))
  Object.assign(request.headers, {
    Signature: `${signatureInputString},signature="${signature.toString(
      'base64'
    )}"`
  })
  return request
}
