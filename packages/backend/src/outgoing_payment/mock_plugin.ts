import {
  deserializeIlpPrepare,
  isIlpReply,
  serializeIlpReply,
  serializeIlpFulfill
} from 'ilp-packet'
import { v4 as uuid } from 'uuid'
import { serializeIldcpResponse } from 'ilp-protocol-ildcp'
import { StreamServer } from '@interledger/stream-receiver'
import { Invoice } from '@interledger/pay'
import { IlpPlugin } from './ilp_plugin'
import { AccountService } from '../account/service'
import { TransferService } from '../transfer/service'

export class MockPlugin implements IlpPlugin {
  public totalReceived = BigInt(0)
  private streamServer: StreamServer
  public exchangeRate: number
  private sourceAccount: string
  private accountService: AccountService
  private transferService: TransferService
  private connected = true
  private invoice: Invoice

  constructor({
    streamServer,
    exchangeRate,
    sourceAccount,
    accountService,
    transferService,
    invoice
  }: {
    streamServer: StreamServer
    exchangeRate: number
    sourceAccount: string
    accountService: AccountService
    transferService: TransferService
    invoice: Invoice
  }) {
    this.streamServer = streamServer
    this.exchangeRate = exchangeRate
    this.sourceAccount = sourceAccount
    this.accountService = accountService
    this.transferService = transferService
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

      const account = await this.accountService.get(this.sourceAccount)
      if (!account) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: 'missing account',
          data: Buffer.alloc(0)
        })
      }
      const error = await this.transferService.create([
        {
          id: uuid(),
          sourceBalanceId: account.balanceId,
          destinationBalanceId: account.asset.settlementBalanceId,
          amount: BigInt(sourceAmount)
        }
      ])
      if (error) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: 'insufficient balance',
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
