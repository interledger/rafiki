import { StreamCredentials } from '@interledger/stream-receiver'
import base64url from 'base64url'
import { IlpAddress } from 'ilp-packet'
import { ILPStreamConnection } from 'open-payments'
import { IncomingPayment } from '../payment/incoming/model'

export abstract class ConnectionBase {
  protected constructor(
    public readonly ilpAddress: IlpAddress,
    public readonly sharedSecret: Buffer,
    public readonly assetCode: string,
    public readonly assetScale: number
  ) {}
}

export class Connection extends ConnectionBase {
  static fromPayment(options: {
    payment: IncomingPayment
    credentials: StreamCredentials
    openPaymentsUrl: string
  }): Connection | undefined {
    if (!options.payment.connectionId) {
      return undefined
    }
    return new this(
      options.payment.connectionId,
      options.openPaymentsUrl,
      options.credentials.ilpAddress,
      options.credentials.sharedSecret,
      options.payment.asset.code,
      options.payment.asset.scale
    )
  }

  private constructor(
    public readonly id: string,
    private readonly openPaymentsUrl: string,
    ilpAddress: IlpAddress,
    sharedSecret: Buffer,
    assetCode: string,
    assetScale: number
  ) {
    super(ilpAddress, sharedSecret, assetCode, assetScale)
  }

  public get url(): string {
    return `${this.openPaymentsUrl}/connections/${this.id}`
  }

  public toOpenPaymentsType(): ILPStreamConnection {
    return {
      id: this.url,
      ilpAddress: this.ilpAddress,
      sharedSecret: base64url(this.sharedSecret),
      assetCode: this.assetCode,
      assetScale: this.assetScale
    }
  }
}
