export interface ConvertSourceOptions {
  // The raw exchange rate, not including the scale difference.
  exchangeRate: number
  sourceAmount: bigint
  sourceAsset: Asset
  destinationAsset: Asset
}

export interface ConvertDestinationOptions {
  exchangeRate: number
  destinationAmount: bigint
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

export function convertSource(opts: ConvertSourceOptions): ConvertResults {
  const scaleDiff = opts.destinationAsset.scale - opts.sourceAsset.scale
  const scaledExchangeRate = opts.exchangeRate * 10 ** scaleDiff

  return {
    amount: BigInt(Math.floor(Number(opts.sourceAmount) * scaledExchangeRate)),
    scaledExchangeRate
  }
}

export function convertDestination(
  opts: ConvertDestinationOptions
): ConvertResults {
  const scaleDiff = opts.destinationAsset.scale - opts.sourceAsset.scale
  const scaledExchangeRate = opts.exchangeRate * 10 ** scaleDiff

  return {
    amount: BigInt(
      Math.ceil(Number(opts.destinationAmount) / scaledExchangeRate)
    ),
    scaledExchangeRate
  }
}
