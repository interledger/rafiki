/* eslint-disable @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-empty-function */
import { DataHandler, PluginInstance } from 'ilp-connector/dist/types/plugin'
import { EventEmitter } from 'events'
import { Int, Ratio, sleep } from '../../src/utils'
import {
  deserializeIlpPrepare,
  IlpError,
  IlpPrepare,
  IlpReply,
  isFulfill,
  isIlpReply,
  serializeIlpReply,
} from 'ilp-packet'
import { Writer } from 'oer-utils'
import { StreamServer } from '@interledger/stream-receiver'
import { AssetDetails } from '../../src'
import { Plugin } from 'ilp-protocol-stream/dist/src/util/plugin-interface'

export type Middleware = (prepare: IlpPrepare, next: SendPrepare) => Promise<IlpReply>

type SendPrepare = (prepare: IlpPrepare) => Promise<IlpReply>

export const createPlugin = (...middlewares: Middleware[]): Plugin => {
  const send = middlewares.reduceRight<SendPrepare>(
    (next, middleware) => (prepare: IlpPrepare) => middleware(prepare, next),
    () => Promise.reject()
  )

  return {
    async connect() {},
    async disconnect() {},
    isConnected() {
      return true
    },
    registerDataHandler() {},
    deregisterDataHandler() {},
    async sendData(data: Buffer): Promise<Buffer> {
      const prepare = deserializeIlpPrepare(data)
      const reply = await send(prepare)
      return serializeIlpReply(reply)
    },
  }
}

export const createMaxPacketMiddleware =
  (amount: Int): Middleware =>
  async (prepare, next) => {
    if (Int.from(prepare.amount)!.isLessThanOrEqualTo(amount)) {
      return next(prepare)
    }

    const writer = new Writer(16)
    writer.writeUInt64(prepare.amount) // Amount received
    writer.writeUInt64(amount.toLong()!) // Maximum

    return {
      code: IlpError.F08_AMOUNT_TOO_LARGE,
      message: '',
      triggeredBy: '',
      data: writer.getBuffer(),
    }
  }

export class RateBackend {
  constructor(
    private incomingAsset: AssetDetails,
    private outgoingAsset: AssetDetails,
    private prices: { [assetCode: string]: number },
    private spread = 0
  ) {}

  setSpread(spread: number): void {
    this.spread = spread
  }

  getRate(): number {
    const sourcePrice = this.prices[this.incomingAsset.code] ?? 1
    const destPrice = this.prices[this.outgoingAsset.code] ?? 1

    // prettier-ignore
    return (sourcePrice / destPrice) *
      10 ** (this.outgoingAsset.scale - this.incomingAsset.scale) *
      (1 - this.spread)
  }
}

export const createRateMiddleware =
  (converter: RateBackend): Middleware =>
  async (prepare, next) => {
    const rate = Ratio.from(converter.getRate())!
    const amount = Int.from(prepare.amount)!.multiplyFloor(rate).toString()
    return next({
      ...prepare,
      amount,
    })
  }

export const createSlippageMiddleware =
  (spread: number): Middleware =>
  async (prepare, next) =>
    next({
      ...prepare,
      amount: Int.from(prepare.amount)!
        .multiplyFloor(Ratio.from(1 - spread)!)
        .toString(),
    })

export const createStreamReceiver =
  (server: StreamServer): Middleware =>
  async (prepare) => {
    const moneyOrReply = server.createReply(prepare)
    return isIlpReply(moneyOrReply) ? moneyOrReply : moneyOrReply.accept()
  }

export const createLatencyMiddleware =
  (min: number, max: number): Middleware =>
  async (prepare, next) => {
    await sleep(getRandomFloat(min, max))
    const reply = await next(prepare)
    await sleep(getRandomFloat(min, max))
    return reply
  }

export const createBalanceTracker = (): { totalReceived: () => Int; middleware: Middleware } => {
  let totalReceived = Int.ZERO
  return {
    totalReceived: () => totalReceived,
    middleware: async (prepare, next) => {
      const reply = await next(prepare)
      if (isFulfill(reply)) {
        totalReceived = totalReceived.add(Int.from(prepare.amount)!)
      }
      return reply
    },
  }
}

const getRandomFloat = (min: number, max: number) => Math.random() * (max - min) + min

const defaultDataHandler = async (): Promise<never> => {
  throw new Error('No data handler registered')
}

export class MirrorPlugin extends EventEmitter implements Plugin, PluginInstance {
  public mirror?: MirrorPlugin

  public dataHandler: DataHandler = defaultDataHandler

  private readonly minNetworkLatency: number
  private readonly maxNetworkLatency: number

  constructor(minNetworkLatency = 10, maxNetworkLatency = 50) {
    super()
    this.minNetworkLatency = minNetworkLatency
    this.maxNetworkLatency = maxNetworkLatency
  }

  static createPair(
    minNetworkLatency?: number,
    maxNetworkLatency?: number
  ): [MirrorPlugin, MirrorPlugin] {
    const pluginA = new MirrorPlugin(minNetworkLatency, maxNetworkLatency)
    const pluginB = new MirrorPlugin(minNetworkLatency, maxNetworkLatency)

    pluginA.mirror = pluginB
    pluginB.mirror = pluginA

    return [pluginA, pluginB]
  }

  async connect(): Promise<void> {}

  async disconnect(): Promise<void> {}

  isConnected(): boolean {
    return true
  }

  async sendData(data: Buffer): Promise<Buffer> {
    if (this.mirror) {
      await this.addNetworkDelay()
      const response = await this.mirror.dataHandler(data)
      await this.addNetworkDelay()
      return response
    } else {
      throw new Error('Not connected')
    }
  }

  registerDataHandler(handler: DataHandler): void {
    this.dataHandler = handler
  }

  deregisterDataHandler(): void {
    this.dataHandler = defaultDataHandler
  }

  async sendMoney(): Promise<void> {}

  registerMoneyHandler(): void {}

  deregisterMoneyHandler(): void {}

  private async addNetworkDelay() {
    await sleep(getRandomFloat(this.minNetworkLatency, this.maxNetworkLatency))
  }
}
