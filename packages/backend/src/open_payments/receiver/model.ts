import { Counter, ResolvedPayment } from '@interledger/pay'
import base64url from 'base64url'

import { Amount, parseAmount } from '../amount'
import { AssetOptions } from '../../asset/service'
import {
  IncomingPayment as OpenPaymentsIncomingPayment,
  ILPStreamConnection as OpenPaymentsConnection
} from 'open-payments'
import { ConnectionBase } from '../connection/model'
import { isValidIlpAddress } from 'ilp-packet'

export class Receiver extends ConnectionBase {
  static fromConnection(connection: OpenPaymentsConnection): Receiver {
    return new this(connection)
  }

  static fromIncomingPayment(
    incomingPayment: OpenPaymentsIncomingPayment
  ): Receiver | undefined {
    if (incomingPayment.completed) {
      return undefined
    }
    if (typeof incomingPayment.ilpStreamConnection !== 'object') {
      return undefined
    }
    if (
      incomingPayment.expiresAt &&
      new Date(incomingPayment.expiresAt).getTime() <= Date.now()
    ) {
      return undefined
    }
    const receivedAmount = parseAmount(incomingPayment.receivedAmount)
    const incomingAmount = incomingPayment.incomingAmount
      ? parseAmount(incomingPayment.incomingAmount)
      : undefined

    return new this(
      incomingPayment.ilpStreamConnection,
      incomingAmount?.value,
      receivedAmount.value
    )
  }

  private constructor(
    connection: OpenPaymentsConnection,
    private readonly incomingAmountValue?: bigint,
    private readonly receivedAmountValue?: bigint
  ) {
    if (!isValidIlpAddress(connection.ilpAddress)) {
      throw new Error('Connection has invalid destination address')
    }

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
      requestCounter: Counter.from(0)
    }
  }
}
