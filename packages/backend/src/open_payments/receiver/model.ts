import { Amount, parseAmount } from '../amount'
import { AssetOptions } from '../../asset/service'
import { IncomingPaymentWithPaymentMethods as OpenPaymentsIncomingPaymentWithPaymentMethod } from '@interledger/open-payments'
import { OpenPaymentsPaymentMethod } from '../../payment-method/provider/service'

type ReceiverIncomingPayment = Readonly<
  Omit<
    OpenPaymentsIncomingPaymentWithPaymentMethod,
    'expiresAt' | 'receivedAmount' | 'incomingAmount' | 'createdAt'
  > & {
    expiresAt?: Date
    createdAt: Date
    receivedAmount: Amount
    incomingAmount?: Amount
  }
>

export class Receiver {
  public readonly assetCode: string
  public readonly assetScale: number
  public readonly incomingPayment: ReceiverIncomingPayment
  public readonly isLocal: boolean

  constructor(
    incomingPayment: OpenPaymentsIncomingPaymentWithPaymentMethod,
    isLocal: boolean
  ) {
    const expiresAt = incomingPayment.expiresAt
      ? new Date(incomingPayment.expiresAt)
      : undefined

    const incomingAmount = incomingPayment.incomingAmount
      ? parseAmount(incomingPayment.incomingAmount)
      : undefined
    const receivedAmount = parseAmount(incomingPayment.receivedAmount)

    this.assetCode = incomingPayment.receivedAmount.assetCode
    this.assetScale = incomingPayment.receivedAmount.assetScale

    this.incomingPayment = {
      ...incomingPayment,
      expiresAt,
      receivedAmount,
      incomingAmount,
      createdAt: new Date(incomingPayment.createdAt)
    }
    this.isLocal = isLocal
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

  public get paymentMethods(): OpenPaymentsPaymentMethod[] {
    return this.incomingPayment.methods
  }

  public isActive(): boolean {
    const incomingPayment = this.incomingPayment

    if (incomingPayment.completed) {
      return false
    }
    if (
      incomingPayment.expiresAt &&
      incomingPayment.expiresAt.getTime() <= Date.now()
    ) {
      return false
    }
    if (!incomingPayment.methods.length) {
      return false
    }

    return true
  }
}
