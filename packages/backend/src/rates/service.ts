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
import { TenantSettingService } from '../tenants/settings/service'
import { TenantSettingKeys } from '../tenants/settings/model'

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
  rates(baseAssetCode: string, tenantId?: string): Promise<Rates>
  convertSource(
    opts: RateConvertSourceOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError>
  convertDestination(
    opts: RateConvertDestinationOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError>
}

interface ServiceDependencies extends BaseService {
  //TODO make this mandatory?
  // If `url` is not set, the connector cannot convert between currencies.
  exchangeRatesUrl?: string
  // Duration (milliseconds) that the fetched rates are valid.
  exchangeRatesLifetime: number
  // If `tenantSettingService` is not used, `exchangeRatesUrl`will be used.
  tenantSettingService?: TenantSettingService
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
  private cache: CacheDataStore<string>
  private inProgressRequests: Record<string, Promise<Rates>> = {}
  private readonly URL_CACHE_PREFIX = 'url:'

  constructor(private deps: ServiceDependencies) {
    this.axios = Axios.create({
      timeout: REQUEST_TIMEOUT,
      validateStatus: (status) => status === 200
    })

    this.cache = createInMemoryDataStore(deps.exchangeRatesLifetime)
  }

  async convert<T extends RateConvertSourceOpts | RateConvertDestinationOpts>(
    opts: T,
    convertFn: (
      opts: T & { exchangeRate: number }
    ) => ConvertResults | ConvertError,
    tenantId?: string
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

    const { rates } = await this.getRates(sourceAsset.code, tenantId)
    const destinationExchangeRate = rates[destinationAsset.code]
    if (!destinationExchangeRate || !isValidPrice(destinationExchangeRate)) {
      return ConvertError.InvalidDestinationPrice
    }

    return convertFn({ ...opts, exchangeRate: destinationExchangeRate })
  }

  async convertSource(
    opts: RateConvertSourceOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError> {
    return this.convert(opts, convertSource, tenantId)
  }

  async convertDestination(
    opts: RateConvertDestinationOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError> {
    return this.convert(opts, convertDestination, tenantId)
  }

  async rates(baseAssetCode: string, tenantId?: string): Promise<Rates> {
    return this.getRates(baseAssetCode, tenantId)
  }

  private async getRates(
    baseAssetCode: string,
    tenantId?: string
  ): Promise<Rates> {
    const cacheKey = tenantId ? `${tenantId}:${baseAssetCode}` : baseAssetCode
    const cachedRate = await this.cache.get(cacheKey)

    if (cachedRate) {
      return JSON.parse(cachedRate)
    }

    return await this.fetchNewRatesAndCache(baseAssetCode, cacheKey, tenantId)
  }

  private async fetchNewRatesAndCache(
    baseAssetCode: string,
    cacheKey: string,
    tenantId?: string
  ): Promise<Rates> {
    if (this.inProgressRequests[cacheKey] === undefined) {
      this.inProgressRequests[cacheKey] = this.fetchNewRates(
        baseAssetCode,
        tenantId
      )
        .then(async (rates) => {
          await this.cache.set(cacheKey, JSON.stringify(rates))
          return rates
        })
        .catch((err) => {
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
              baseAssetCode,
            },
            errorMessage
          )

          throw new Error(errorMessage)
        })
        .finally(() => {
          delete this.inProgressRequests[cacheKey]
        })
    }

    return this.inProgressRequests[cacheKey]
  }

  private async fetchNewRates(
    baseAssetCode: string,
    tenantId?: string
  ): Promise<Rates> {
    let url
    try {
      url = await this.getExchangeRatesUrl(tenantId)
    } catch (err) {
      const errorMessage = 'Could not get url for exchange rates'

      this.deps.logger.error(
        {
          ...(isAxiosError(err)
            ? {
                errorMessage: err.message,
                errorCode: err.code,
                errorStatus: err.status
              }
            : { err })
        },
        errorMessage
      )

      throw new Error(errorMessage)
    }
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

  private async getExchangeRatesUrl(
    tenantId?: string
  ): Promise<string | undefined> {
    if (!tenantId || !this.deps.tenantSettingService) {
      return this.deps.exchangeRatesUrl
    }

    const urlCacheKey = `${this.URL_CACHE_PREFIX}${tenantId}`
    const cachedUrl = await this.cache.get(urlCacheKey)
    if (cachedUrl) {
      return cachedUrl
    }

    try {
      const exchangeUrlSetting = await this.deps.tenantSettingService.get({
        tenantId,
        key: TenantSettingKeys.EXCHANGE_RATES_URL.name
      })

      const tenantExchangeRatesUrl = Array.isArray(exchangeUrlSetting)
        ? exchangeUrlSetting[0].value
        : exchangeUrlSetting.value

      //TODO Maybe not throw if url not found in settings and fallback to default instead?
      if (!tenantExchangeRatesUrl) {
        throw new Error('No exchange rates URL found')
      }
      await this.cache.set(urlCacheKey, tenantExchangeRatesUrl)

      return tenantExchangeRatesUrl
    } catch (error) {
      this.deps.logger.error({ error }, 'Failed to get exchange rates URL')
    }
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
