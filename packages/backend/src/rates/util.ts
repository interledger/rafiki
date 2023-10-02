export interface ConvertOptions {
  // The raw exchange rate, not including the scale difference.
  exchangeRate: number
  sourceAmount: bigint
  sourceAsset: Asset
  destinationAsset: Asset
}

export interface Asset {
  code: string
  scale: number
}

export function convert(opts: ConvertOptions): bigint {
  const scaleDiff = opts.destinationAsset.scale - opts.sourceAsset.scale
  const scaledExchangeRate = opts.exchangeRate * 10 ** scaleDiff

  return BigInt(Math.round(Number(opts.sourceAmount) * scaledExchangeRate))
}
