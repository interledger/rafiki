import {
  deserializeIlpPrepare,
  isIlpReply,
  serializeIlpReply,
  serializeIlpFulfill
} from 'ilp-packet'
import { serializeIldcpResponse } from 'ilp-protocol-ildcp'
import { StreamServer } from '@interledger/stream-receiver'
import { IlpPlugin } from './ilp_plugin'
import { MockConnectorService } from '../tests/mockConnectorService'

export class MockPlugin implements IlpPlugin {
  public totalReceived = BigInt(0)
  private streamServer: StreamServer
  public exchangeRate: number
  private sourceAccount: string
  private connectorService: MockConnectorService
  private connected = true

  constructor({
    streamServer,
    exchangeRate,
    sourceAccount,
    connectorService
  }: {
    streamServer: StreamServer
    exchangeRate: number
    sourceAccount: string
    connectorService: MockConnectorService
  }) {
    this.streamServer = streamServer
    this.exchangeRate = exchangeRate
    this.sourceAccount = sourceAccount
    this.connectorService = connectorService
  }

  connect(): Promise<void> {
    return Promise.resolve()
  }

  disconnect(): Promise<void> {
    this.connected = false
    return Promise.resolve()
  }

  isConnected(): boolean {
    return this.connected
  }

  async sendData(data: Buffer): Promise<Buffer> {
    // First, handle the initial IL-DCP request when the connection is created
    const prepare = deserializeIlpPrepare(data)
    if (prepare.destination === 'peer.config') {
      return serializeIldcpResponse({
        clientAddress: 'test.wallet',
        assetCode: 'XRP',
        assetScale: 9
      })
    } else {
      const sourceAmount = prepare.amount
      prepare.amount = Math.floor(+sourceAmount * this.exchangeRate).toString()
      const moneyOrReject = this.streamServer.createReply(prepare)
      if (isIlpReply(moneyOrReject)) {
        return serializeIlpReply(moneyOrReject)
      }

      const success = this.connectorService.modifyAccountBalance(
        this.sourceAccount,
        -BigInt(sourceAmount)
      )
      if (!success) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: 'insufficient balance',
          data: Buffer.alloc(0)
        })
      }

      this.totalReceived += BigInt(prepare.amount)

      return serializeIlpFulfill(moneyOrReject.accept())
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  registerDataHandler(_handler: (data: Buffer) => Promise<Buffer>): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deregisterDataHandler(): void {}
}
