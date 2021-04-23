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
import { RafikiContext, RafikiMiddleware } from '../rafiki'
import getRawBody from 'raw-body'

const CONTENT_TYPE = 'application/octet-stream'

export function ilpAddressToPath (ilpAddress: string, prefix?: string): string {
  return (prefix || '') + ilpAddress.replace(/\./g, '/')
}

export interface IlpPacketMiddlewareOptions {
  getRawBody?: (req: Readable) => Promise<Buffer>;
}

interface RawPacket {
  readonly raw: Buffer;
}

export interface RafikiPrepare extends IlpPrepare {
  intAmount: bigint;
  readonly originalAmount: bigint;
  readonly originalExpiresAt: Date;

  readonly amountChanged: boolean;
  readonly expiresAtChanged: boolean;
}

export class ZeroCopyIlpPrepare implements RafikiPrepare {
  private _originalAmount: bigint
  private _originalExpiresAt: Date
  private _prepare: IlpPrepare
  private _amount: bigint
  public _expiresAtChanged = false
  public _amountChanged = false

  constructor (prepare: Buffer | IlpPrepare) {
    const packet = Buffer.isBuffer(prepare)
      ? deserializeIlpPrepare(prepare)
      : prepare
    this._prepare = packet
    this._originalAmount = this._amount = BigInt(packet.amount)
    this._originalExpiresAt = packet.expiresAt
  }

  get destination (): string {
    return this._prepare.destination
  }

  get executionCondition (): Buffer {
    return this._prepare.executionCondition
  }

  get data (): Buffer {
    return this._prepare.data
  }

  set expiresAt (val: Date) {
    this._expiresAtChanged = true
    this._prepare.expiresAt = val
  }

  get expiresAt (): Date {
    return this._prepare.expiresAt
  }

  set amount (val: string) {
    this._amountChanged = true
    this._prepare.amount = val
    this._amount = BigInt(val)
  }

  get amount (): string {
    return this._prepare.amount
  }

  set intAmount (val: bigint) {
    this._amountChanged = true
    this._prepare.amount = val.toString()
    this._amount = val
  }

  get intAmount (): bigint {
    return this._amount
  }

  get amountChanged (): boolean {
    return this._amountChanged
  }

  get expiresAtChanged (): boolean {
    return this._expiresAtChanged
  }

  get originalAmount (): bigint {
    return this._originalAmount
  }

  get originalExpiresAt (): Date {
    return this._originalExpiresAt
  }
}

export function createIlpPacketMiddleware (
  config?: IlpPacketMiddlewareOptions
): RafikiMiddleware {
  const _getRawBody =
    config && config.getRawBody ? config.getRawBody : getRawBody

  return async function ilpPacket (
    ctx: RafikiContext,
    next: () => Promise<any>
  ): Promise<void> {
    ctx.assert(
      ctx.request.type === CONTENT_TYPE,
      400,
      'Expected Content-Type of ' + CONTENT_TYPE
    )
    const buffer = await _getRawBody(ctx.req)
    const prepare = new ZeroCopyIlpPrepare(buffer)
    ctx.req.prepare = prepare
    ctx.request.prepare = prepare
    ctx.req.rawPrepare = buffer
    ctx.request.rawPrepare = buffer
    ctx.path = ilpAddressToPath(prepare.destination, ctx.path)

    let reject: IlpReject | undefined
    let fulfill: IlpFulfill | undefined
    let rawReject: Buffer | undefined
    let rawFulfill: Buffer | undefined

    const properties: PropertyDescriptorMap = {
      fulfill: {
        enumerable: true,
        get: (): IlpFulfill | undefined => fulfill,
        set: (val: IlpFulfill | undefined): void => {
          fulfill = val
          if (val) {
            reject = rawReject = undefined
            rawFulfill = serializeIlpFulfill(val)
          } else {
            rawFulfill = undefined
          }
        }
      },
      rawFulfill: {
        enumerable: true,
        get: (): Buffer | undefined => rawFulfill,
        set: (val: Buffer | undefined): void => {
          rawFulfill = val
          if (val) {
            reject = rawReject = undefined
            fulfill = deserializeIlpFulfill(val)
          } else {
            fulfill = undefined
          }
        }
      },
      reject: {
        enumerable: true,
        get: (): IlpReject | undefined => reject,
        set: (val: IlpReject | undefined): void => {
          reject = val
          if (val) {
            fulfill = rawFulfill = undefined
            rawReject = serializeIlpReject(val)
          } else {
            rawReject = undefined
          }
        }
      },
      rawReject: {
        enumerable: true,
        get: (): Buffer | undefined => rawReject,
        set: (val: Buffer | undefined): void => {
          rawReject = val
          if (val) {
            fulfill = rawFulfill = undefined
            reject = deserializeIlpReject(val)
          } else {
            reject = undefined
          }
        }
      },
      reply: {
        enumerable: true,
        get: (): IlpFulfill | IlpReject | undefined => fulfill || reject,
        set: (val: IlpReply | undefined): void => {
          if (val) {
            if (isFulfill(val)) {
              fulfill = val
              rawFulfill = serializeIlpFulfill(val)
              reject = rawReject = undefined
            } else {
              reject = val
              rawReject = serializeIlpReject(val)
              fulfill = rawFulfill = undefined
            }
          } else {
            fulfill = rawFulfill = undefined
            reject = rawReject = undefined
          }
        }
      },
      rawReply: {
        enumerable: true,
        get: (): Buffer | undefined => rawFulfill || rawReject,
        set: (val: Buffer | undefined): void => {
          if (val) {
            const packet = deserializeIlpReply(val)
            if (isFulfill(packet)) {
              fulfill = packet
              rawFulfill = val
              reject = rawReject = undefined
            } else {
              reject = packet
              rawReject = val
              fulfill = rawFulfill = undefined
            }
          } else {
            fulfill = rawFulfill = undefined
            reject = rawReject = undefined
          }
        }
      }
    }
    Object.defineProperties(ctx.res, properties)
    Object.defineProperties(ctx.response, properties)

    await next()

    ctx.assert(!ctx.body, 500, 'response body already set')
    ctx.assert(ctx.response.rawReply, 500, 'ilp reply not set')
    ctx.body = ctx.response.rawReply
  }
}
