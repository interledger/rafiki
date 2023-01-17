import { BaseService } from '../shared/baseService'
import Axios, { AxiosInstance } from 'axios'
import { convert, ConvertOptions } from './util'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface RatesService {
  prices(): Promise<Prices>
  convert(
    opts: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError>
}

interface ServiceDependencies extends BaseService {
  // If `url` is not set, the connector cannot convert between currencies.
  pricesUrl?: string
  // Duration (milliseconds) that the fetched prices are valid.
  pricesLifetime: number
}

interface Prices {
  [currency: string]: number
}

interface PricesResponse {
  base: string
  rates: Prices
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
  private pricesRequest?: Promise<Prices>
  private pricesExpiry?: Date
  private prefetchRequest?: Promise<Prices>

  constructor(private deps: ServiceDependencies) {
    this.axios = Axios.create({
      timeout: REQUEST_TIMEOUT,
      validateStatus: (status) => status === 200
    })
  }

  async convert(
    opts: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError> {
    const sameCode = opts.sourceAsset.code === opts.destinationAsset.code
    const sameScale = opts.sourceAsset.scale === opts.destinationAsset.scale
    if (sameCode && sameScale) return opts.sourceAmount
    if (sameCode) return convert({ exchangeRate: 1.0, ...opts })

    const prices = await this.sharedLoad()
    const sourcePrice = prices[opts.sourceAsset.code]
    if (!sourcePrice) return ConvertError.MissingSourceAsset
    if (!isValidPrice(sourcePrice)) return ConvertError.InvalidSourcePrice
    const destinationPrice = prices[opts.destinationAsset.code]
    if (!destinationPrice) return ConvertError.MissingDestinationAsset
    if (!isValidPrice(destinationPrice))
      return ConvertError.InvalidDestinationPrice

    // source asset → base currency → destination asset
    const exchangeRate = sourcePrice / destinationPrice
    return convert({ exchangeRate, ...opts })
  }

  async prices(): Promise<Prices> {
    return this.sharedLoad()
  }

  private sharedLoad(): Promise<Prices> {
    if (this.pricesRequest && this.pricesExpiry) {
      if (this.pricesExpiry < new Date()) {
        // Already expired: invalidate cached prices.
        this.pricesRequest = undefined
        this.pricesExpiry = undefined
      } else if (
        this.pricesExpiry.getTime() <
        Date.now() + 0.5 * this.deps.pricesLifetime
      ) {
        // Expiring soon: start prefetch.
        if (!this.prefetchRequest) {
          this.prefetchRequest = this.loadNow().finally(() => {
            this.prefetchRequest = undefined
          })
        }
      }
    }

    if (!this.pricesRequest) {
      this.pricesRequest =
        this.prefetchRequest ||
        this.loadNow().catch((err) => {
          this.pricesRequest = undefined
          this.pricesExpiry = undefined
          throw err
        })
    }
    return this.pricesRequest
  }

  private async loadNow(): Promise<Prices> {
    const url = this.deps.pricesUrl
    if (!url) return {}

    const res = await this.axios.get<PricesResponse>(url).catch((err) => {
      this.deps.logger.warn({ err: err.message }, 'price request error')
      throw err
    })

    const { base, rates } = res.data
    this.checkBaseAsset(base)

    const data = {
      [base]: 1.0,
      ...(rates ? rates : {})
    }

    this.pricesRequest = Promise.resolve(data)
    this.pricesExpiry = new Date(Date.now() + this.deps.pricesLifetime)
    return data
  }

  checkBaseAsset(asset: unknown): void {
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
