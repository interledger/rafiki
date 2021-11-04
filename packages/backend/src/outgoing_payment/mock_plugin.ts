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
import { isAccountTransferError } from '../account/errors'
import { Account } from '../account/model'
import { AccountService } from '../account/service'

export class MockPlugin implements IlpPlugin {
  public totalReceived = BigInt(0)
  private streamServer: StreamServer
  public exchangeRate: number
  private sourceAccount: Account
  private destinationAccountId: string
  private accountService: AccountService
  private connected = true
  private invoice: Invoice

  constructor({
    streamServer,
    exchangeRate,
    sourceAccount,
    destinationAccountId,
    accountService,
    invoice
  }: {
    streamServer: StreamServer
    exchangeRate: number
    sourceAccount: Account
    destinationAccountId: string
    accountService: AccountService
    invoice: Invoice
  }) {
    this.streamServer = streamServer
    this.exchangeRate = exchangeRate
    this.sourceAccount = sourceAccount
    this.destinationAccountId = destinationAccountId
    this.accountService = accountService
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

      const destinationAccount = await this.accountService.get(
        this.destinationAccountId
      )
      if (!destinationAccount) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: 'missing account',
          data: Buffer.alloc(0)
        })
      }

      const trxOrError = await this.accountService.transferFunds({
        sourceAccount: this.sourceAccount,
        destinationAccount,
        sourceAmount: BigInt(sourceAmount),
        timeout: BigInt(10e9) // 10 seconds
      })
      if (isAccountTransferError(trxOrError)) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: trxOrError,
          data: Buffer.alloc(0)
        })
      }

      const error = await trxOrError.commit()
      if (error) {
        return serializeIlpReply({
          code: 'F00',
          triggeredBy: '',
          message: error,
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
