interface IlpAccountAsset {
  code: string
  scale: number
}

export interface IlpAccountHttp {
  incomingTokens: string[]
  incomingEndpoint: string
  outgoingToken: string
  outgoingEndpoint: string
}

export interface IlpAccountStream {
  enabled: boolean
  suffix: string // read-only; ILP suffix for STREAM server receiving
}

export interface IlpAccountRouting {
  prefixes: string[] // prefixes that route to this account
  ilpAddress: string // ILP address for this account
}

export interface IlpAccount {
  id: string
  disabled: boolean // you can fetch config of disabled account but it will not process packets

  // details of how we implement this TBD
  parentAccountId?: string

  asset: IlpAccountAsset
  http?: IlpAccountHttp
  stream?: IlpAccountStream
  routing?: IlpAccountRouting
}

export interface UpdateIlpAccountOptions {
  id: string
  disabled?: boolean // you can fetch config of disabled account but it will not process packets

  http?: Partial<IlpAccountHttp>
  stream?: Partial<IlpAccountStream>
  routing?: Partial<IlpAccountRouting>
}
