import { Attributes, Counter, MetricOptions } from '@opentelemetry/api'
import { TelemetryService } from '../telemetry/meter'
import { Rates, RatesService } from '../rates/service'

export const mockCounter = { add: jest.fn() } as Counter

export class MockRatesService implements RatesService {
  async convert(): Promise<bigint> {
    return BigInt(1)
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
  getOrCreate(
    _name: string,
    _options?: MetricOptions | undefined
  ): Counter<Attributes> {
    return mockCounter
  }
  getServiceName(): string | undefined {
    return 'serviceName'
  }

  getTelemetryRatesService(): RatesService {
    return new MockRatesService()
  }

  getBaseAssetCode(): string {
    return 'USD'
  }

  applyPrivacy(rawValue: number): number {
    return rawValue + Math.random() * 100
  }
}
