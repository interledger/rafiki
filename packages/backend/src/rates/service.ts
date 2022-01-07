import { BaseService } from '../shared/baseService'
import Axios, { AxiosInstance } from 'axios'
import { convert, ConvertOptions } from './util'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface RatesService {
  prices(): Promise<Prices>
  convert(
    opts: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | RateError>
  getRate(opts: RateOptions): Promise<number | RateError>
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

interface RateOptions {
  sourceAssetCode: string
  destinationAssetCode: string
}

export enum RateError {
  MissingSourceAsset = 'MissingSourceAsset',
  MissingDestinationAsset = 'MissingDestinationAsset',
  InvalidSourcePrice = 'InvalidSourcePrice',
  InvalidDestinationPrice = 'InvalidDestinationPrice'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isRateError = (o: any): o is RateError =>
  Object.values(RateError).includes(o)

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
  ): Promise<bigint | RateError> {
    const sameCode = opts.sourceAsset.code === opts.destinationAsset.code
    const sameScale = opts.sourceAsset.scale === opts.destinationAsset.scale
    if (sameCode && sameScale) return opts.sourceAmount
    if (sameCode) return convert({ exchangeRate: 1.0, ...opts })

    const exchangeRate = await this.getRate({
      sourceAssetCode: opts.sourceAsset.code,
      destinationAssetCode: opts.destinationAsset.code
    })
    if (isRateError(exchangeRate)) return exchangeRate
    return convert({ exchangeRate, ...opts })
  }

  async prices(): Promise<Prices> {
    return this.sharedLoad()
  }

  async getRate({
    sourceAssetCode,
    destinationAssetCode
  }: RateOptions): Promise<number | RateError> {
    if (sourceAssetCode === destinationAssetCode) return 1.0

    const prices = await this.sharedLoad()
    const sourcePrice = prices[sourceAssetCode]
    if (!sourcePrice) return RateError.MissingSourceAsset
    if (!isValidPrice(sourcePrice)) return RateError.InvalidSourcePrice
    const destinationPrice = prices[destinationAssetCode]
    if (!destinationPrice) return RateError.MissingDestinationAsset
    if (!isValidPrice(destinationPrice))
      return RateError.InvalidDestinationPrice

    // source asset → base currency → destination asset
    return sourcePrice / destinationPrice
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

    const res = await this.axios.get(url).catch((err) => {
      this.deps.logger.warn({ err: err.message }, 'price request error')
      throw err
    })
    this.pricesRequest = Promise.resolve(res.data)
    this.pricesExpiry = new Date(Date.now() + this.deps.pricesLifetime)
    return res.data
  }
}

function isValidPrice(r: unknown): boolean {
  return typeof r === 'number' && isFinite(r) && r > 0
}
