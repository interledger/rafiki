import { BaseService } from '../shared/baseService'
import Axios, { AxiosInstance } from 'axios'
import { convert, ConvertOptions } from './util'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface RatesService {
  rates(): Promise<Rates>
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

interface Rates {
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
  private ratesRequest?: Promise<Rates>
  private ratesExpiry?: Date
  private prefetchRequest?: Promise<Rates>

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

    const rates = await this.sharedLoad()
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

  async rates(): Promise<Rates> {
    return this.sharedLoad()
  }

  private sharedLoad(): Promise<Rates> {
    if (this.ratesRequest && this.ratesExpiry) {
      if (this.ratesExpiry < new Date()) {
        // Already expired: invalidate cached rates.
        this.ratesRequest = undefined
        this.ratesExpiry = undefined
      } else if (
        this.ratesExpiry.getTime() <
        Date.now() + 0.5 * this.deps.exchangeRatesLifetime
      ) {
        // Expiring soon: start prefetch.
        if (!this.prefetchRequest) {
          this.prefetchRequest = this.loadNow().finally(() => {
            this.prefetchRequest = undefined
          })
        }
      }
    }

    if (!this.ratesRequest) {
      this.ratesRequest =
        this.prefetchRequest ||
        this.loadNow().catch((err) => {
          this.ratesRequest = undefined
          this.ratesExpiry = undefined
          throw err
        })
    }
    return this.ratesRequest
  }

  private async loadNow(): Promise<Rates> {
    const url = this.deps.exchangeRatesUrl
    if (!url) return {}

    const res = await this.axios.get<RatesResponse>(url).catch((err) => {
      this.deps.logger.warn({ err: err.message }, 'price request error')
      throw err
    })

    const { base, rates } = res.data
    this.checkBaseAsset(base)

    const data = {
      [base]: 1.0,
      ...(rates ? rates : {})
    }

    this.ratesRequest = Promise.resolve(data)
    this.ratesExpiry = new Date(Date.now() + this.deps.exchangeRatesLifetime)
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
