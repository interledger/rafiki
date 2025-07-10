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
  readonly operatorTenantId: string
  // Default exchange rates `url` of the operator.
  // If tenant doesn't set a specific url in the db, this one will be used.
  // In case neither tenant nor operator doesn't set an exchange url, the connector cannot convert between currencies.
  operatorExchangeRatesUrl?: string
  // Duration (milliseconds) that the fetched rates are valid.
  exchangeRatesLifetime: number
  // Used for getting the exchange rates URL from db.
  tenantSettingService: TenantSettingService
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
    tenantId: string
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
    return this.convert(
      opts,
      convertSource,
      tenantId ?? this.deps.operatorTenantId
    )
  }

  async convertDestination(
    opts: RateConvertDestinationOpts,
    tenantId?: string
  ): Promise<ConvertResults | ConvertError> {
    return this.convert(
      opts,
      convertDestination,
      tenantId ?? this.deps.operatorTenantId
    )
  }

  async rates(baseAssetCode: string, tenantId?: string): Promise<Rates> {
    return this.getRates(baseAssetCode, tenantId ?? this.deps.operatorTenantId)
  }

  private async getRates(
    baseAssetCode: string,
    tenantId: string
  ): Promise<Rates> {
    const ratesCacheKey = `${tenantId}:${baseAssetCode}`
    const cachedRate = await this.cache.get(ratesCacheKey)

    if (cachedRate) {
      return JSON.parse(cachedRate)
    }

    return await this.fetchNewRatesAndCache(baseAssetCode, tenantId)
  }

  private async fetchNewRatesAndCache(
    baseAssetCode: string,
    tenantId: string
  ): Promise<Rates> {
    const ratesCacheKey = `${tenantId}:${baseAssetCode}`
    if (this.inProgressRequests[ratesCacheKey] === undefined) {
      this.inProgressRequests[ratesCacheKey] = this.fetchNewRates(
        baseAssetCode,
        tenantId
      )
    }
    try {
      const rates = await this.inProgressRequests[ratesCacheKey]
      await this.cache.set(ratesCacheKey, JSON.stringify(rates))
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
          baseAssetCode
        },
        errorMessage
      )

      throw new Error(errorMessage)
    } finally {
      delete this.inProgressRequests[ratesCacheKey]
    }
  }

  private async fetchNewRates(
    baseAssetCode: string,
    tenantId: string
  ): Promise<Rates> {
    const url = await this.getExchangeRatesUrl(tenantId)

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
    tenantId: string
  ): Promise<string | undefined> {
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

      const tenantExchangeRatesUrl = exchangeUrlSetting[0]?.value
      if (!tenantExchangeRatesUrl) {
        return this.deps.operatorExchangeRatesUrl
      }

      await this.cache.set(urlCacheKey, tenantExchangeRatesUrl)

      return tenantExchangeRatesUrl
    } catch (error) {
      this.deps.logger.error(
        { error },
        'Failed to get exchange rates URL from database'
      )
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
