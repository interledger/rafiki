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

type ReceiverIncomingPayment = Readonly<
  Omit<
    OpenPaymentsIncomingPayment,
    | 'ilpStreamConnection'
    | 'expiresAt'
    | 'receivedAmount'
    | 'incomingAmount'
    | 'createdAt'
    | 'updatedAt'
  > & {
    expiresAt?: Date
    createdAt: Date
    updatedAt: Date
    receivedAmount: Amount
    incomingAmount?: Amount
  }
>

export class Receiver extends ConnectionBase {
  static fromConnection(connection: OpenPaymentsConnection): Receiver {
    if (!isValidIlpAddress(connection.ilpAddress)) {
      return undefined
    }

    return new this({
      id: connection.id,
      assetCode: connection.assetCode,
      assetScale: connection.assetScale,
      sharedSecret: connection.sharedSecret,
      ilpAddress: connection.ilpAddress
    })
  }

  static fromIncomingPayment(
    incomingPayment: OpenPaymentsIncomingPayment
  ): Receiver | undefined {
    if (incomingPayment.completed) {
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

    if (!isValidIlpAddress(incomingPayment.ilpStreamConnection.ilpAddress)) {
      return undefined
    }

    return new this(
      {
        ...incomingPayment.ilpStreamConnection,
        ilpAddress: incomingPayment.ilpStreamConnection.ilpAddress
      },
      {
        id: incomingPayment.id,
        completed: incomingPayment.completed,
        paymentPointer: incomingPayment.paymentPointer,
        expiresAt,
        receivedAmount,
        incomingAmount,
        description: incomingPayment.description,
        externalRef: incomingPayment.externalRef,
        createdAt: new Date(incomingPayment.createdAt),
        updatedAt: new Date(incomingPayment.updatedAt)
      }
    )
  }

  private constructor(
    connection: OpenPaymentsConnectionWithIlpAddress,
    public incomingPayment?: ReceiverIncomingPayment
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
    if (this.incomingPayment?.incomingAmount) {
      return {
        value: this.incomingPayment.incomingAmount.value,
        assetCode: this.assetCode,
        assetScale: this.assetScale
      }
    }
    return undefined
  }

  public get receivedAmount(): Amount | undefined {
    if (this.incomingPayment?.receivedAmount) {
      return {
        value: this.incomingPayment.receivedAmount.value,
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
      requestCounter: Counter.from(0)
    }
  }
}
