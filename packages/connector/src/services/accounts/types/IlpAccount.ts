interface CreateIlpAccountBalanceOptions {
  assetCode: string
  assetScale: number

  // details of how we implement this TBD
  parentAccountId?: string
}

interface IlpAccountBalance extends CreateIlpAccountBalanceOptions {
  current: bigint
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

export interface CreateIlpAccountOptions {
  id: string
  disabled: boolean // you can fetch config of disabled account but it will not process packets

  balance: CreateIlpAccountBalanceOptions
  http?: IlpAccountHttp
  stream?: IlpAccountStream
  routing?: IlpAccountRouting
}

export interface IlpAccount extends CreateIlpAccountOptions {
  balance: IlpAccountBalance
}

export interface UpdateIlpAccountOptions {
  id: string
  disabled?: boolean // you can fetch config of disabled account but it will not process packets

  http?: Partial<IlpAccountHttp>
  stream?: Partial<IlpAccountStream>
  routing?: Partial<IlpAccountRouting>
}
