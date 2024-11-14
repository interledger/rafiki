import { Counter, Histogram } from '@opentelemetry/api'
import { TelemetryService } from '../telemetry/service'
import {
  ConvertError,
  isConvertError,
  Rates,
  RatesService
} from '../rates/service'
import { ConvertOptions, ConvertResults } from '../rates/util'

export const mockCounter = { add: jest.fn() } as Counter
export const mockHistogram = { record: jest.fn() } as Histogram

export class MockRatesService implements RatesService {
  async convert(): Promise<ConvertResults | ConvertError> {
    return { amount: BigInt(10000), scaledExchangeRate: 1.0 }
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
  public internalRatesService = new MockRatesService()

  incrementCounter(): void {}
  async incrementCounterWithTransactionAmount(): Promise<void> {}
  async incrementCounterWithTransactionAmountDifference(): Promise<void> {}
  async recordHistogram(): Promise<void> {}
  public getInstanceName(): string | undefined {
    return 'serviceName'
  }
  public async shutdown(): Promise<void> {}
  public startTimer(): () => void {
    return () => undefined
  }

  public async convertAmount(
    _convertOptions: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<ConvertResults | ConvertError> {
    let converted = await this.aseRatesService.convert()
    if (isConvertError(converted)) {
      converted = await this.internalRatesService.convert()
    }
    return Promise.resolve(converted)
  }
}
