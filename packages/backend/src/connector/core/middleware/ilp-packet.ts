/**
 * Parse ILP packets
 */
import {
  deserializeIlpFulfill,
  deserializeIlpPrepare,
  deserializeIlpReject,
  IlpFulfill,
  IlpPrepare,
  IlpReject,
  IlpReply,
  isFulfill,
  serializeIlpFulfill,
  serializeIlpReject,
  deserializeIlpReply
} from 'ilp-packet'
import { Readable } from 'stream'
import { HttpContext, HttpMiddleware, ILPMiddleware } from '../rafiki'
import getRawBody from 'raw-body'

export const CONTENT_TYPE = 'application/octet-stream'

export interface IlpPacketMiddlewareOptions {
  getRawBody?: (req: Readable) => Promise<Buffer>
}

export class ZeroCopyIlpPrepare implements IlpPrepare {
  private _originalAmount: bigint
  private _originalExpiresAt: Date
  private _prepare: IlpPrepare
  private _amount: bigint
  public _expiresAtChanged = false
  public _amountChanged = false

  constructor(prepare: Buffer | IlpPrepare) {
    const packet = Buffer.isBuffer(prepare)
      ? deserializeIlpPrepare(prepare)
      : prepare
    this._prepare = packet
    this._originalAmount = this._amount = BigInt(packet.amount)
    this._originalExpiresAt = packet.expiresAt
  }

  get destination(): string {
    return this._prepare.destination
  }

  get executionCondition(): Buffer {
    return this._prepare.executionCondition
  }

  get data(): Buffer {
    return this._prepare.data
  }

  set expiresAt(val: Date) {
    this._expiresAtChanged = true
    this._prepare.expiresAt = val
  }

  get expiresAt(): Date {
    return this._prepare.expiresAt
  }

  set amount(val: string) {
    this._amountChanged = true
    this._prepare.amount = val
    this._amount = BigInt(val)
  }

  get amount(): string {
    return this._prepare.amount
  }

  set intAmount(val: bigint) {
    this._amountChanged = true
    this._prepare.amount = val.toString()
    this._amount = val
  }

  get intAmount(): bigint {
    return this._amount
  }

  get amountChanged(): boolean {
    return this._amountChanged
  }

  get expiresAtChanged(): boolean {
    return this._expiresAtChanged
  }

  get originalAmount(): bigint {
    return this._originalAmount
  }

  get originalExpiresAt(): Date {
    return this._originalExpiresAt
  }
}

export class IlpResponse {
  private _fulfill?: IlpFulfill
  private _reject?: IlpReject
  private _rawFulfill?: Buffer
  private _rawReject?: Buffer

  get fulfill(): IlpFulfill | undefined {
    return this._fulfill
  }

  set fulfill(val: IlpFulfill | undefined) {
    this._fulfill = val
    if (val) {
      this._reject = this._rawReject = undefined
      this._rawFulfill = serializeIlpFulfill(val)
    } else {
      this._rawFulfill = undefined
    }
  }

  get rawFulfill(): Buffer | undefined {
    return this._rawFulfill
  }
  set rawFulfill(val: Buffer | undefined) {
    this._rawFulfill = val
    if (val) {
      this._reject = this._rawReject = undefined
      this._fulfill = deserializeIlpFulfill(val)
    } else {
      this._fulfill = undefined
    }
  }

  get reject(): IlpReject | undefined {
    return this._reject
  }
  set reject(val: IlpReject | undefined) {
    this._reject = val
    if (val) {
      this._fulfill = this._rawFulfill = undefined
      this._rawReject = serializeIlpReject(val)
    } else {
      this._rawReject = undefined
    }
  }

  get rawReject(): Buffer | undefined {
    return this._rawReject
  }
  set rawReject(val: Buffer | undefined) {
    this._rawReject = val
    if (val) {
      this._fulfill = this._rawFulfill = undefined
      this._reject = deserializeIlpReject(val)
    } else {
      this._reject = undefined
    }
  }

  get reply(): IlpFulfill | IlpReject | undefined {
    return this.fulfill || this.reject
  }
  set reply(val: IlpReply | undefined) {
    if (val) {
      if (isFulfill(val)) {
        this.fulfill = val
      } else {
        this.reject = val
      }
    } else {
      this._fulfill = this._rawFulfill = undefined
      this._reject = this._rawReject = undefined
    }
  }

  get rawReply(): Buffer | undefined {
    return this.rawFulfill || this.rawReject
  }
  set rawReply(val: Buffer | undefined) {
    if (val) {
      const packet = deserializeIlpReply(val)
      if (isFulfill(packet)) {
        this._fulfill = packet
        this._rawFulfill = val
        this._reject = this._rawReject = undefined
      } else {
        this._reject = packet
        this._rawReject = val
        this._fulfill = this._rawFulfill = undefined
      }
    } else {
      this._fulfill = this._rawFulfill = undefined
      this._reject = this._rawReject = undefined
    }
  }
}

export function createIlpPacketMiddleware(
  ilpHandler: ILPMiddleware,
  config?: IlpPacketMiddlewareOptions
): HttpMiddleware {
  const _getRawBody =
    config && config.getRawBody ? config.getRawBody : getRawBody

  return async function ilpPacket(
    ctx: HttpContext,
    next: () => Promise<void>
  ): Promise<void> {
    ctx.assert(
      ctx.request.type === CONTENT_TYPE,
      400,
      'Expected Content-Type of ' + CONTENT_TYPE
    )
    const buffer = await _getRawBody(ctx.req)
    const prepare = new ZeroCopyIlpPrepare(buffer)

    const response = new IlpResponse()
    await ilpHandler(
      {
        services: ctx.services,
        accounts: ctx.accounts,
        throw: ctx.throw,
        state: ctx.state,
        request: {
          prepare,
          rawPrepare: buffer
        },
        response
      },
      next
    )

    ctx.assert(!ctx.body, 500, 'response body already set')
    ctx.assert(response.rawReply, 500, 'ilp reply not set')
    ctx.body = response.rawReply
  }
}
