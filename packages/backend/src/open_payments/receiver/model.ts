import { Counter, ResolvedPayment } from '@interledger/pay'
import base64url from 'base64url'

import { Amount, parseAmount } from '../amount'
import { AssetOptions } from '../../asset/service'
import {
  IncomingPaymentWithConnection as OpenPaymentsIncomingPaymentWithConnection,
  ILPStreamConnection as OpenPaymentsConnection
} from '@interledger/open-payments'
import { ConnectionBase } from '../connection/model'
import { IlpAddress, isValidIlpAddress } from 'ilp-packet'

interface OpenPaymentsConnectionWithIlpAddress
  extends Omit<OpenPaymentsConnection, 'ilpAddress'> {
  ilpAddress: IlpAddress
}

type ReceiverIncomingPayment = Readonly<
  Omit<
    OpenPaymentsIncomingPaymentWithConnection,
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
  static fromConnection(
    connection: OpenPaymentsConnection
  ): Receiver | undefined {
    if (!isValidIlpAddress(connection.ilpAddress)) {
      throw new Error('Invalid ILP address on stream connection')
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
    incomingPayment: OpenPaymentsIncomingPaymentWithConnection
  ): Receiver {
    if (!incomingPayment.ilpStreamConnection) {
      throw new Error('Missing stream connection on incoming payment')
    }

    if (incomingPayment.completed) {
      throw new Error('Cannot create receiver from completed incoming payment')
    }

    const expiresAt = incomingPayment.expiresAt
      ? new Date(incomingPayment.expiresAt)
      : undefined

    if (expiresAt && expiresAt.getTime() <= Date.now()) {
      throw new Error('Cannot create receiver from expired incoming payment')
    }

    const incomingAmount = incomingPayment.incomingAmount
      ? parseAmount(incomingPayment.incomingAmount)
      : undefined
    const receivedAmount = parseAmount(incomingPayment.receivedAmount)

    if (!isValidIlpAddress(incomingPayment.ilpStreamConnection.ilpAddress)) {
      throw new Error('Invalid ILP address on stream connection')
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
      requestCounter: Counter.from(0) as Counter
    }
  }
}
