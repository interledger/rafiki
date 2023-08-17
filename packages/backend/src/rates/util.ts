import { Rates } from './service'

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

interface IlpPrices {
  [currency: string]: number
}

// For ILP Pay, exchange rates are represented as the ratio between a destination amount and a source amount (i.e. inversed)
export function convertRatesToIlpPrices({ base, rates }: Rates): IlpPrices {
  const ilpPrices: IlpPrices = {
    [base]: 1
  }

  for (const [key, value] of Object.entries(rates)) {
    ilpPrices[key] = value > 0 ? 1 / value : 0
  }

  return ilpPrices
}
