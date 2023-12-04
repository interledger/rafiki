import { Attributes, Counter, MetricOptions } from '@opentelemetry/api'
import { TelemetryService } from '../telemetry/meter'

export const mockCounter = { add: jest.fn() } as Counter

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
}
