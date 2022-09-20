import type { LoaderArgs } from '@remix-run/node'
import { Response } from '@remix-run/node'
import * as http from 'http'
import * as url from 'url'

export function loader({ request }: LoaderArgs): Promise<Response> {
  return new Promise((resolve, reject) => {
    const respondWithProxyError = (errorMessage?: string) => {
      resolve(
        new Response(errorMessage, {
          status: 503
        })
      )
    }

    let forwardUrl: string | null = null
    let forwardHostname: string | null = null
    let forwardPort: string | null = null
    let forwardMethod = request.method
    const proxyUrl = url.parse(request.url)
    if (proxyUrl.query) {
      const searchParams = new url.URLSearchParams(proxyUrl.query)
      forwardUrl = searchParams.get('target')
      forwardHostname = searchParams.get('hostname')
      forwardPort = searchParams.get('port')
      if (searchParams.has('method')) {
        forwardMethod = searchParams.get('method')!
      }
    }

    if (forwardUrl && forwardHostname && forwardPort) {
      const proxyHeaders: http.OutgoingHttpHeaders = {}
      request.headers.forEach((value, key) => {
        if (/^[^\(\)<>@,;:\\"\/\[\]\?=\{\}]{1,}$/g.test(key)) {
          proxyHeaders[key] = value
        }
      })
      const proxyRequest = http.request({
        hostname: forwardHostname,
        port: Number(forwardPort),
        path: '/' + forwardUrl,
        method: forwardMethod,
        headers: proxyHeaders
      })

      proxyRequest.on('error', (err) => {
        respondWithProxyError()
      })

      proxyRequest.on('response', (upstreamResponse) => {
        let upstreamResponseBody = ''
        upstreamResponse.on('data', (chunk) => {
          upstreamResponseBody += chunk
        })
        upstreamResponse.on('end', () => {
          const downstreamHeaders: HeadersInit = {}
          Object.keys(upstreamResponse.headers).forEach((headerKey) => {
            downstreamHeaders[
              headerKey
            ] = `${upstreamResponse.headers[headerKey]}`
          })
          resolve(
            new Response(upstreamResponseBody, {
              status: upstreamResponse.statusCode,
              headers: downstreamHeaders
            })
          )
        })
        upstreamResponse.on('error', (err) => {
          respondWithProxyError()
        })
      })
      if (request.body) {
        proxyRequest.write(request.body.getReader().read())
      } else {
        proxyRequest.write('')
      }
    } else {
      respondWithProxyError('missing target url')
    }
  })
}
