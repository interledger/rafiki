import { Rates } from '../../../rates/service'

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
