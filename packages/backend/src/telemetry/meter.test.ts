import { MockTelemetryService, mockCounter } from '../tests/meter'

const telemetryService = new MockTelemetryService()
describe('TelemetryServiceImpl', () => {
  it('should create a counter when getOrCreate is called for a new metric', () => {
    const counter = telemetryService.getOrCreate('testMetric')
    expect(counter).toBe(mockCounter)
  })

  it('should return an existing counter when getOrCreate is called for an existing metric', () => {
    const existingCounter = telemetryService.getOrCreate('existingMetric')
    const retrievedCounter = telemetryService.getOrCreate('existingMetric')
    expect(retrievedCounter).toBe(existingCounter)
  })

  it('should return the instance name when calling getServiceName', () => {
    const serviceName = telemetryService.getServiceName()

    expect(serviceName).toBe('serviceName')
  })
})
