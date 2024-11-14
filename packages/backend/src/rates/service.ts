import { BaseService } from '../shared/baseService'
import Axios, { AxiosInstance, isAxiosError } from 'axios'
import {
  ConvertResults,
  ConvertSourceOptions,
  ConvertDestinationOptions,
  convertDestination,
  convertSource
} from './util'
import { createInMemoryDataStore } from '../middleware/cache/data-stores/in-memory'
import { CacheDataStore } from '../middleware/cache/data-stores'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface Rates {
  base: string
  rates: Record<string, number>
}

export type RateConvertSourceOpts = Omit<ConvertSourceOptions, 'exchangeRate'>
export type RateConvertDestinationOpts = Omit<
  ConvertDestinationOptions,
  'exchangeRate'
>

export interface RatesService {
  rates(baseAssetCode: string): Promise<Rates>
  convertSource(
    opts: RateConvertSourceOpts
  ): Promise<ConvertResults | ConvertError>
  convertDestination(
    opts: RateConvertDestinationOpts
  ): Promise<ConvertResults | ConvertError>
}

interface ServiceDependencies extends BaseService {
  // If `url` is not set, the connector cannot convert between currencies.
  exchangeRatesUrl?: string
  // Duration (milliseconds) that the fetched rates are valid.
  exchangeRatesLifetime: number
}

export enum ConvertError {
  InvalidDestinationPrice = 'InvalidDestinationPrice'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isConvertError = (o: any): o is ConvertError =>
  Object.values(ConvertError).includes(o)

export function createRatesService(deps: ServiceDependencies): RatesService {
  return new RatesServiceImpl(deps)
}

class RatesServiceImpl implements RatesService {
  private axios: AxiosInstance
  private cachedRates: CacheDataStore
  private inProgressRequests: Record<string, Promise<Rates>> = {}

  constructor(private deps: ServiceDependencies) {
    this.axios = Axios.create({
      timeout: REQUEST_TIMEOUT,
      validateStatus: (status) => status === 200
    })

    this.cachedRates = createInMemoryDataStore(deps.exchangeRatesLifetime)
  }

  async convert<T extends RateConvertSourceOpts | RateConvertDestinationOpts>(
    opts: T,
    convertFn: (
      opts: T & { exchangeRate: number }
    ) => ConvertResults | ConvertError
  ): Promise<ConvertResults | ConvertError> {
    const { sourceAsset, destinationAsset } = opts
    const sameCode = sourceAsset.code === destinationAsset.code
    const sameScale = sourceAsset.scale === destinationAsset.scale

    if (sameCode && sameScale) {
      const amount =
        'sourceAmount' in opts ? opts.sourceAmount : opts.destinationAmount
      return {
        amount,
        scaledExchangeRate: 1
      }
    }

    if (sameCode) {
      return convertFn({ ...opts, exchangeRate: 1.0 })
    }

    const { rates } = await this.getRates(sourceAsset.code)
    const destinationExchangeRate = rates[destinationAsset.code]
    if (!destinationExchangeRate || !isValidPrice(destinationExchangeRate)) {
      return ConvertError.InvalidDestinationPrice
    }

    return convertFn({ ...opts, exchangeRate: destinationExchangeRate })
  }

  async convertSource(
    opts: RateConvertSourceOpts
  ): Promise<ConvertResults | ConvertError> {
    return this.convert(opts, convertSource)
  }

  async convertDestination(
    opts: RateConvertDestinationOpts
  ): Promise<ConvertResults | ConvertError> {
    return this.convert(opts, convertDestination)
  }

  async rates(baseAssetCode: string): Promise<Rates> {
    return this.getRates(baseAssetCode)
  }

  private async getRates(baseAssetCode: string): Promise<Rates> {
    const cachedRate = await this.cachedRates.get(baseAssetCode)

    if (cachedRate) {
      return JSON.parse(cachedRate)
    }

    return await this.fetchNewRatesAndCache(baseAssetCode)
  }

  private async fetchNewRatesAndCache(baseAssetCode: string): Promise<Rates> {
    const inProgressRequest = this.inProgressRequests[baseAssetCode]

    if (!inProgressRequest) {
      this.inProgressRequests[baseAssetCode] = this.fetchNewRates(baseAssetCode)
    }

    try {
      const rates = await this.inProgressRequests[baseAssetCode]

      await this.cachedRates.set(baseAssetCode, JSON.stringify(rates))
      return rates
    } catch (err) {
      const errorMessage = 'Could not fetch rates'

      this.deps.logger.error(
        {
          ...(isAxiosError(err)
            ? {
                errorMessage: err.message,
                errorCode: err.code,
                errorStatus: err.status
              }
            : { err }),
          url: this.deps.exchangeRatesUrl
        },
        errorMessage
      )

      throw new Error(errorMessage)
    } finally {
      delete this.inProgressRequests[baseAssetCode]
    }
  }

  private async fetchNewRates(baseAssetCode: string): Promise<Rates> {
    const url = this.deps.exchangeRatesUrl
    if (!url) {
      return { base: baseAssetCode, rates: {} }
    }

    const res = await this.axios.get<Rates>(url, {
      params: { base: baseAssetCode }
    })

    const { base, rates } = res.data
    this.checkBaseAsset(base)

    return { base, rates }
  }

  private checkBaseAsset(asset: unknown): void {
    let errorMessage: string | undefined
    if (!asset) {
      errorMessage = 'Missing base asset'
    } else if (typeof asset !== 'string') {
      errorMessage = 'Base asset should be a string'
    }

    if (errorMessage) {
      this.deps.logger.warn({ err: errorMessage }, `received asset: ${asset}`)
      throw new Error(errorMessage)
    }
  }
}

function isValidPrice(r: unknown): boolean {
  return typeof r === 'number' && isFinite(r) && r > 0
}
