import { Counter, ResolvedPayment } from '@interledger/pay'
import base64url from 'base64url'

import { Amount, parseAmount } from '../amount'
import { AssetOptions } from '../../asset/service'
import {
  IncomingPayment as OpenPaymentsIncomingPayment,
  ILPStreamConnection as OpenPaymentsConnection
} from 'open-payments'
import { ConnectionBase } from '../connection/model'
import { IlpAddress, isValidIlpAddress } from 'ilp-packet'

interface OpenPaymentsConnectionWithIlpAddress
  extends Omit<OpenPaymentsConnection, 'ilpAddress'> {
  ilpAddress: IlpAddress
}

export class Receiver extends ConnectionBase {
  static fromConnection(
    connection: OpenPaymentsConnection
  ): Receiver | undefined {
    return this.fromOpenPaymentsConnection(connection)
  }

  static fromIncomingPayment(
    incomingPayment: OpenPaymentsIncomingPayment
  ): Receiver | undefined {
    if (!incomingPayment.ilpStreamConnection || incomingPayment.completed) {
      return undefined
    }

    const expiresAt = incomingPayment.expiresAt
      ? new Date(incomingPayment.expiresAt)
      : undefined

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      return undefined
    }

    const incomingAmount = incomingPayment.incomingAmount
      ? parseAmount(incomingPayment.incomingAmount)
      : undefined
    const receivedAmount = parseAmount(incomingPayment.receivedAmount)

    return this.fromOpenPaymentsConnection(
      incomingPayment.ilpStreamConnection,
      incomingAmount?.value,
      receivedAmount.value,
      expiresAt
    )
  }

  private static fromOpenPaymentsConnection(
    connection: OpenPaymentsConnection,
    incomingAmountValue?: bigint,
    receivedAmountValue?: bigint,
    expiresAt?: Date
  ): Receiver | undefined {
    const ilpAddress = connection.ilpAddress

    if (!isValidIlpAddress(ilpAddress)) {
      return undefined
    }

    return new this(
      {
        id: connection.id,
        assetCode: connection.assetCode,
        assetScale: connection.assetScale,
        sharedSecret: connection.sharedSecret,
        ilpAddress
      },
      incomingAmountValue,
      receivedAmountValue,
      expiresAt
    )
  }

  private constructor(
    connection: OpenPaymentsConnectionWithIlpAddress,
    private readonly incomingAmountValue?: bigint,
    private readonly receivedAmountValue?: bigint,
    public readonly expiresAt?: Date
  ) {
    super(
      connection.ilpAddress,
      base64url.toBuffer(connection.sharedSecret),
      connection.assetCode,
      connection.assetScale
    )
  }

  public get asset(): AssetOptions {
    return {
      code: this.assetCode,
      scale: this.assetScale
    }
  }

  public get incomingAmount(): Amount | undefined {
    if (this.incomingAmountValue) {
      return {
        value: this.incomingAmountValue,
        assetCode: this.assetCode,
        assetScale: this.assetScale
      }
    }
    return undefined
  }

  public get receivedAmount(): Amount | undefined {
    if (this.receivedAmountValue !== undefined) {
      return {
        value: this.receivedAmountValue,
        assetCode: this.assetCode,
        assetScale: this.assetScale
      }
    }
    return undefined
  }

  public toResolvedPayment(): ResolvedPayment {
    return {
      destinationAsset: this.asset,
      destinationAddress: this.ilpAddress,
      sharedSecret: this.sharedSecret,
      requestCounter: Counter.from(0) as Counter
    }
  }
}
