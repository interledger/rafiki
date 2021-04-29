export interface AccountInfo {
  id: string
  peerId: string
  assetCode: string
  assetScale: number
  maximumPayable: bigint
  maximumReceivable: bigint
  settleTo?: bigint
  settlementThreshold?: bigint
  settlementEngine?: string
}
