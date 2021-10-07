import {
  deserializeIlpPrepare,
  isIlpReply,
  serializeIlpReply,
  serializeIlpFulfill
} from 'ilp-packet'
import { serializeIldcpResponse } from 'ilp-protocol-ildcp'
import { StreamServer } from '@interledger/stream-receiver'
import { Invoice } from '@interledger/pay'
import { IlpPlugin } from './ilp_plugin'
import { WithdrawalService } from '../withdrawal/service'
import { isWithdrawalError } from '../withdrawal/errors'

export class MockPlugin implements IlpPlugin {
  public totalReceived = BigInt(0)
  private streamServer: StreamServer
  public exchangeRate: number
  private accountId: string
  private withdrawalService: WithdrawalService
  private connected = true
  private invoice: Invoice

  constructor({
    streamServer,
    exchangeRate,
    accountId,
    withdrawalService,
    invoice
  }: {
    streamServer: StreamServer
    exchangeRate: number
    accountId: string
    withdrawalService: WithdrawalService
    invoice: Invoice
  }) {
    this.streamServer = streamServer
    this.exchangeRate = exchangeRate
    this.accountId = accountId
    this.withdrawalService = withdrawalService
    this.invoice = invoice
  }

  connect(): Promise<void> {
    this.connected = true
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

      const withdrawalOrError = await this.withdrawalService.create({
        accountId: this.accountId,
        amount: BigInt(sourceAmount)
      })
      if (isWithdrawalError(withdrawalOrError)) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: withdrawalOrError,
          data: Buffer.alloc(0)
        })
      }

      this.totalReceived += BigInt(prepare.amount)
      this.invoice.amountDelivered += BigInt(prepare.amount)

      return serializeIlpFulfill(moneyOrReject.accept())
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  registerDataHandler(_handler: (data: Buffer) => Promise<Buffer>): void {}

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  deregisterDataHandler(): void {}
}
