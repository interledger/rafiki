import { BaseService } from '../shared/baseService'
import Axios, { AxiosInstance } from 'axios'
import { convert, ConvertOptions } from './util'
import { createInMemoryDataStore } from '../middleware/cache/data-stores/in-memory'
import { CacheDataStore } from '../middleware/cache/data-stores'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface RatesService {
  rates(baseAssetCode: string): Promise<Rates>
  convert(
    opts: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError>
}

interface ServiceDependencies extends BaseService {
  // If `url` is not set, the connector cannot convert between currencies.
  exchangeRatesUrl?: string
  // Duration (milliseconds) that the fetched rates are valid.
  exchangeRatesLifetime: number
}

export interface Rates {
  [currency: string]: number
}

interface RatesResponse {
  base: string
  rates: Rates
}

export enum ConvertError {
  MissingSourceAsset = 'MissingSourceAsset',
  MissingDestinationAsset = 'MissingDestinationAsset',
  InvalidSourcePrice = 'InvalidSourcePrice',
  InvalidDestinationPrice = 'InvalidDestinationPrice'
}

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

  async convert(
    opts: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError> {
    const sameCode = opts.sourceAsset.code === opts.destinationAsset.code
    const sameScale = opts.sourceAsset.scale === opts.destinationAsset.scale
    if (sameCode && sameScale) return opts.sourceAmount
    if (sameCode) return convert({ exchangeRate: 1.0, ...opts })

    const rates = await this.getRates(opts.sourceAsset.code)
    const sourcePrice = rates[opts.sourceAsset.code]
    if (!sourcePrice) return ConvertError.MissingSourceAsset
    if (!isValidPrice(sourcePrice)) return ConvertError.InvalidSourcePrice
    const destinationPrice = rates[opts.destinationAsset.code]
    if (!destinationPrice) return ConvertError.MissingDestinationAsset
    if (!isValidPrice(destinationPrice))
      return ConvertError.InvalidDestinationPrice

    // source asset → base currency → destination asset
    const exchangeRate = sourcePrice / destinationPrice
    return convert({ exchangeRate, ...opts })
  }

  async rates(baseAssetCode: string): Promise<Rates> {
    return this.getRates(baseAssetCode)
  }

  private async getRates(baseAssetCode: string): Promise<Rates> {
    const [cachedRate, cachedExpiry] = await Promise.all([
      this.cachedRates.get(baseAssetCode),
      this.cachedRates.getKeyExpiry(baseAssetCode)
    ])

    if (cachedRate && cachedExpiry) {
      const isCloseToExpiry =
        cachedExpiry.getTime() <
        Date.now() + 0.5 * this.deps.exchangeRatesLifetime

      if (isCloseToExpiry) {
        this.fetchNewRatesAndCache(baseAssetCode) // don't await, just get new rates for later
      }

      return JSON.parse(cachedRate)
    }

    try {
      return await this.fetchNewRatesAndCache(baseAssetCode)
    } catch (err) {
      this.cachedRates.delete(baseAssetCode)
      throw err
    }
  }

  private async fetchNewRatesAndCache(baseAssetCode: string): Promise<Rates> {
    const inProgressRequest = this.inProgressRequests[baseAssetCode]

    if (!inProgressRequest) {
      this.inProgressRequests[baseAssetCode] = this.fetchNewRates(baseAssetCode)
    }

    const rates = await this.inProgressRequests[baseAssetCode]

    delete this.inProgressRequests[baseAssetCode]

    await this.cachedRates.set(baseAssetCode, JSON.stringify(rates))
    return rates
  }

  private async fetchNewRates(baseAssetCode: string): Promise<Rates> {
    const url = this.deps.exchangeRatesUrl
    if (!url) return {}

    const res = await this.axios
      .get<RatesResponse>(url, { params: { base: baseAssetCode } })
      .catch((err) => {
        this.deps.logger.warn({ err: err.message }, 'price request error')
        throw err
      })

    const { base, rates } = res.data
    this.checkBaseAsset(base)

    const data = {
      [base]: 1.0,
      ...(rates ? rates : {})
    }

    return data
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
