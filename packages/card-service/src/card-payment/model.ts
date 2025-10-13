import { BaseModel } from '../shared/baseModel'

export class CardPayment extends BaseModel {
  public static get tableName(): string {
    return 'cardPayments'
  }

  public requestId!: string
  public requestedAt!: Date | null
  public finalizedAt!: Date | null
  public cardWalletAddress!: string
  public incomingPaymentUrl?: string
  public statusCode?: number
  public outgoingPaymentId?: string
  public terminalId!: string
}
