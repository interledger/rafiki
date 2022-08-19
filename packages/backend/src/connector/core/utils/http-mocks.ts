/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/ban-ts-comment */
import {
  IncomingMessage,
  IncomingHttpHeaders,
  STATUS_CODES,
  OutgoingHttpHeaders,
  OutgoingHttpHeader
} from 'http'
import { Transform } from 'stream'
import { Socket } from 'net'

export interface MockIncomingMessageOptions {
  [key: string]: string | undefined | string[] | IncomingHttpHeaders
  method?: string
  url?: string
  headers?: IncomingHttpHeaders
  rawHeaders?: string[]
}

export class MockIncomingMessage extends Transform {
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  id: string | number | Record<string, unknown>
  httpVersion: '1.1' = '1.1'
  httpVersionMajor: 1 = 1
  httpVersionMinor: 1 = 1
  aborted = false
  complete = false
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  connection: Socket
  headers: IncomingHttpHeaders
  rawHeaders: string[]
  trailers: { [key: string]: string | undefined } = {}
  rawTrailers: string[] = []

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  setTimeout(msecs: number, callback: () => void): this {
    throw new Error('method not implemented.')
  }

  method?: string | undefined
  url?: string | undefined
  statusCode?: number | undefined
  statusMessage?: string | undefined
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  socket: Socket

  private _failError?: Error

  constructor(options: MockIncomingMessageOptions = {}) {
    super({
      writableObjectMode: true,
      readableObjectMode: false,
      transform: (chunk, encoding, next) => {
        if (this._failError) {
          return this.emit('error', this._failError)
        }
        if (typeof chunk !== 'string' && !Buffer.isBuffer(chunk)) {
          chunk = JSON.stringify(chunk)
        }
        this.push(chunk)
        next()
      }
    })

    // Copy unreserved options
    const reservedOptions = ['method', 'url', 'headers', 'rawHeaders']
    Object.keys(options).forEach((key) => {
      if (reservedOptions.indexOf(key) === -1) {
        this[key] = options[key]
      }
    })

    this.method = options.method || 'GET'
    this.url = options.url || ''

    // Set header names
    this.headers = {}
    this.rawHeaders = []
    if (options.headers) {
      Object.keys(options.headers).forEach((key) => {
        const header = options.headers![key]
        if (header !== undefined) {
          this.headers[key.toLowerCase()] = header
          this.rawHeaders.push(key)
          this.rawHeaders.push(
            typeof header !== 'string' ? header.join(' ') : header
          )
        }
      })
    }

    // Auto-end when no body
    if (
      this.method === 'GET' ||
      this.method === 'HEAD' ||
      this.method === 'DELETE'
    ) {
      this.end()
    }
  }

  public fail(error: Error): void {
    this._failError = error
  }
}

export class MockServerResponse extends Transform {
  statusCode: number
  statusMessage: string

  upgrading = false
  chunkedEncoding = false
  shouldKeepAlive = false
  useChunkedEncodingByDefault = false
  sendDate = true
  finished = false
  headersSent = false
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  connection: Socket
  socket: Socket | null = null

  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  setTimeout: (msecs: number, callback?: () => void) => this
  setHeader = (name: string, value: number | string | string[]): void => {
    this._headers[name.toLowerCase()] = value
  }

  getHeader = (name: string): number | string | string[] | undefined => {
    return this._headers[name.toLowerCase()]
  }

  getHeaders = (): OutgoingHttpHeaders => {
    return this._headers
  }

  getHeaderNames = (): string[] => {
    return Object.keys(this._headers)
  }

  hasHeader = (name: string): boolean => {
    return this._headers[name.toLowerCase()] !== undefined
  }

  removeHeader = (name: string): void => {
    delete this._headers[name.toLowerCase()]
  }

  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  addTrailers: (headers: OutgoingHttpHeaders | Array<[string, string]>) => void
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  flushHeaders: () => void
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  assignSocket: (socket: Socket) => void
  // @ts-ignore: Property has no initializer and is not definitely assigned in the constructor.
  detachSocket: (socket: Socket) => void

  writeContinue = (callback?: () => void): void => {
    if (callback) callback()
  }

  writeHead = (
    statusCode: number,
    reasonPhrase?: string | OutgoingHttpHeaders | OutgoingHttpHeader[],
    headers?: OutgoingHttpHeaders | OutgoingHttpHeader[]
  ): this => {
    if (typeof reasonPhrase !== 'string') {
      headers = reasonPhrase
      reasonPhrase = undefined
    }
    this.statusCode = statusCode
    // @ts-ignore
    this.statusMessage = reasonPhrase || STATUS_CODES[statusCode] || 'unknown'
    if (headers) {
      for (const name in headers) {
        if (headers[name]) this.setHeader(name, headers[name]!)
      }
    }
    return this
  }

  writeProcessing = (): void => {
    /* noop */
  }

  _responseData: (Buffer | string)[] = []
  _headers: OutgoingHttpHeaders = {}

  constructor(req: IncomingMessage, finish?: () => void) {
    super({
      transform: (chunk, encoding, next) => {
        this.push(chunk)
        this._responseData.push(chunk)
        next()
      }
    })
    this.statusCode = 200
    this.statusMessage = STATUS_CODES[this.statusCode] || ''

    if (finish) {
      this.on('finish', finish)
    }
    this.finished = false

    this.on('end', () => {
      this.finished = true
    })
  }
}
