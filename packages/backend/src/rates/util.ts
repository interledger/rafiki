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

export interface ConvertResults {
  amount: bigint
  scaledExchangeRate: number
}

export function convert(opts: ConvertOptions): ConvertResults {
  const scaleDiff = opts.destinationAsset.scale - opts.sourceAsset.scale
  const scaledExchangeRate = opts.exchangeRate * 10 ** scaleDiff

  return {
    amount: BigInt(Math.round(Number(opts.sourceAmount) * scaledExchangeRate)),
    scaledExchangeRate
  }
}

export function convertReverse(opts: ConvertOptions): ConvertResults {
  const scaleDiff = opts.sourceAsset.scale - opts.destinationAsset.scale
  const scaledExchangeRate = opts.exchangeRate * 10 ** scaleDiff

  return {
    amount: BigInt(Math.ceil(Number(opts.sourceAmount) / scaledExchangeRate)),
    scaledExchangeRate
  }
}
