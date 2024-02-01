import { Attributes, Counter, MetricOptions } from '@opentelemetry/api'
import { TelemetryService } from '../telemetry/service'
import { ConvertError, Rates, RatesService } from '../rates/service'
import { ConvertOptions } from '../rates/util'

export const mockCounter = { add: jest.fn() } as Counter

export class MockRatesService implements RatesService {
  async convert(): Promise<bigint | ConvertError> {
    return BigInt(10000)
  }
  async rates(): Promise<Rates> {
    return {
      base: 'USD',
      rates: {
        BGN: 0.55,
        BNB: 249.39,
        BTC: 40829.24,
        ETH: 2162.15,
        EUR: 1.08,
        GBP: 1.25,
        RON: 0.22,
        USD: 1,
        XRP: 0.5994
      }
    }
  }
}

export class MockTelemetryService implements TelemetryService {
  public aseRatesService = new MockRatesService()
  public fallbackRatesService = new MockRatesService()
  public getOrCreateMetric(
    _name: string,
    _options?: MetricOptions | undefined
  ): Counter<Attributes> {
    return mockCounter
  }
  public getServiceName(): string | undefined {
    return 'serviceName'
  }

  public async convertAmount(
    _convertOptions: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError> {
    let converted = await this.aseRatesService.convert()
    if (typeof converted !== 'bigint' && converted in ConvertError) {
      converted = await this.fallbackRatesService.convert()
    }
    return Promise.resolve(converted)
  }

  public getBaseAssetCode(): string {
    return 'USD'
  }

  public getBaseScale(): number {
    return 4
  }
}
