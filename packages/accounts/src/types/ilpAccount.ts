export interface IlpAccount {
  accountId: string
  parentAccountId?: string
  disabled: boolean // you can fetch config of disabled account but it will not process packets

  asset: {
    code: string
    scale: number
  }
  http?: {
    outgoing: {
      authToken: string
      endpoint: string
    }
  }
  stream?: {
    enabled: boolean
  }
  routing?: {
    staticIlpAddress: string // ILP address for this account
  }

  maxPacketAmount?: bigint
}
