export interface Amount {
  value: bigint
  assetCode: string
  assetScale: number
}

export interface AmountJSON {
  value: string
  assetCode: string
  assetScale: number
}

export function parseAmount(amount: AmountJSON): Amount {
  return {
    value: BigInt(amount['value']),
    assetCode: amount['assetCode'],
    assetScale: amount['assetScale']
  }
}

export function serializeAmount(amount: Amount): AmountJSON {
  return {
    value: amount.value.toString(),
    assetCode: amount.assetCode,
    assetScale: amount.assetScale
  }
}
