import { Counter, ResolvedPayment } from '@interledger/pay'
import base64url from 'base64url'

import { ConnectionJSON } from '../connection/service'
import { IncomingPaymentJSON } from '../payment/incoming/model'

export type Receiver = Omit<IncomingPaymentJSON, 'ilpStreamConnection'> & {
  ilpStreamConnection: ConnectionJSON
}

export const isReceiver = (
  incomingPayment: IncomingPaymentJSON
): incomingPayment is Receiver => {
  if (incomingPayment.completed) {
    return false
  }
  if (
    incomingPayment.expiresAt &&
    new Date(incomingPayment.expiresAt).getTime() <= Date.now()
  ) {
    return false
  }
  if (incomingPayment.incomingAmount) {
    if (
      incomingPayment.incomingAmount.assetCode !==
        incomingPayment.receivedAmount.assetCode ||
      incomingPayment.incomingAmount.assetScale !==
        incomingPayment.receivedAmount.assetScale
    ) {
      return false
    }
    if (
      BigInt(incomingPayment.incomingAmount.value) <=
      BigInt(incomingPayment.receivedAmount.value)
    ) {
      return false
    }
  }
  return typeof incomingPayment.ilpStreamConnection === 'object'
}

export const toResolvedPayment = (
  incomingPayment: Receiver
): ResolvedPayment => {
  return {
    destinationAsset: {
      code: incomingPayment.receivedAmount.assetCode,
      scale: incomingPayment.receivedAmount.assetScale
    },
    destinationAddress: incomingPayment.ilpStreamConnection.ilpAddress,
    sharedSecret: base64url.toBuffer(
      incomingPayment.ilpStreamConnection.sharedSecret
    ),
    requestCounter: Counter.from(0)
  }
}
