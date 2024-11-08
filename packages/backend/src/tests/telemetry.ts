import { Counter, Histogram } from '@opentelemetry/api'
import { TelemetryService } from '../telemetry/service'
import { ConvertError, Rates, RatesService } from '../rates/service'
import { ConvertOptions } from '../rates/util'

export const mockCounter = { add: jest.fn() } as Counter
export const mockHistogram = { record: jest.fn() } as Histogram

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
  public internalRatesService = new MockRatesService()

  incrementCounter(): void {}
  async incrementCounterWithTransactionAmount(): Promise<void> {}
  async incrementCounterWithTransactionAmountDifference(): Promise<void> {}
  async recordHistogram(): Promise<void> {}
  getCounters(): Map<string, Counter> {
    return new Map<string, Counter>()
  }
  getHistograms(): Map<string, Histogram> {
    return new Map<string, Histogram>()
  }
  public getInstanceName(): string | undefined {
    return 'serviceName'
  }
  /* eslint-disable @typescript-eslint/no-unused-vars */
  public startTimer(
    name: string,
    attributes?: Record<string, unknown>
  ): () => void {
    return () => undefined
  }
  public async shutdown(): Promise<void> {}
  public startTimer(): () => void {
    return () => undefined
  }

  public async convertAmount(
    _convertOptions: Omit<ConvertOptions, 'exchangeRate'>
  ): Promise<bigint | ConvertError> {
    let converted = await this.aseRatesService.convert()
    if (typeof converted !== 'bigint' && converted in ConvertError) {
      converted = await this.internalRatesService.convert()
    }
    return Promise.resolve(converted)
  }
}
