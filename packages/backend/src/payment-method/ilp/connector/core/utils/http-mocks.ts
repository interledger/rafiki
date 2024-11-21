import {
  IncomingMessage,
  IncomingHttpHeaders,
  STATUS_CODES,
  OutgoingHttpHeaders,
  OutgoingHttpHeader
} from 'http'
import { Transform } from 'stream'
import { Socket } from 'net'

type GenericOptionValues = string | undefined | string[] | IncomingHttpHeaders

export interface MockIncomingMessageOptions {
  [key: string]: GenericOptionValues
  method?: string
  url?: string
  headers?: IncomingHttpHeaders
  rawHeaders?: string[]
}

export class MockIncomingMessage extends Transform {
  readonly httpVersion = '1.1'
  readonly httpVersionMajor = 1
  readonly httpVersionMinor = 1
  id!: string | number | Record<string, unknown>
  aborted = false
  complete = false
  connection!: Socket
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
  socket!: Socket

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
        ;(this as unknown as Record<string, GenericOptionValues>)[key] =
          options[key]
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
  connection!: Socket
  socket: Socket | null = null

  setTimeout!: (msecs: number, callback?: () => void) => this
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

  addTrailers!: (headers: OutgoingHttpHeaders | Array<[string, string]>) => void
  flushHeaders!: () => void
  assignSocket!: (socket: Socket) => void
  detachSocket!: (socket: Socket) => void

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
    this.statusMessage = reasonPhrase || STATUS_CODES[statusCode] || 'unknown'
    if (headers) {
      for (const [name, header] of Object.entries(headers)) {
        if (name) this.setHeader(name, header!)
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
