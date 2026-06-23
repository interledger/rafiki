export class RatesError extends Error {
  public type: RatesErrorCode
  public details?: Record<string, unknown>

  constructor(type: RatesErrorCode, details?: Record<string, unknown>) {
    super(errorToMessage[type])
    this.type = type
    this.details = details
  }
}

export enum RatesErrorCode {
  CouldNotFetchRates = 'CouldNotFetchRates',
  MissingExchangeRatesUrl = 'MissingExchangeRatesUrl',
  FailedToGetExchangeRatesUrl = 'FailedToGetExchangeRatesUrl',
  MissingBaseAsset = 'MissingBaseAsset',
  InvalidBaseAsset = 'InvalidBaseAsset'
}

export enum ConvertError {
  InvalidDestinationPrice = 'InvalidDestinationPrice'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isConvertError = (o: any): o is ConvertError =>
  Object.values(ConvertError).includes(o)

export const errorToMessage: {
  [key in RatesErrorCode]: string
} = {
  [RatesErrorCode.CouldNotFetchRates]: 'Could not fetch exchange rates',
  [RatesErrorCode.MissingExchangeRatesUrl]: 'Missing exchange rates URL',
  [RatesErrorCode.FailedToGetExchangeRatesUrl]:
    'Failed to get exchange rates URL from database',
  [RatesErrorCode.MissingBaseAsset]: 'Missing base asset',
  [RatesErrorCode.InvalidBaseAsset]: 'Base asset should be a string'
}
