export type AccessAction = 'create' | 'read' | 'list' | 'complete'

export type AccessType =
  | 'account'
  | 'incoming-payment'
  | 'outgoing-payment'
  | 'quote'

export interface PaymentAmount {
  value: string
  assetCode: string
  assetScale: number
}

export interface AccessLimit {
  receiver: string
  sendAmount?: PaymentAmount
  receiveAmount?: PaymentAmount
}

export interface Access {
  grantId: string
  type: AccessType
  actions: Array<AccessAction>
  limits?: AccessLimit
}
