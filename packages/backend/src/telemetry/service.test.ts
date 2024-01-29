import { ConvertError } from '../rates/service'
import { MockTelemetryService, mockCounter } from '../tests/telemetry'

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

  describe('conversion', () => {
    it('should try to convert using aseRatesService and fallback to fallbackRatesService', async () => {
      const aseConvertSpy = jest
        .spyOn(telemetryService.aseRatesService, 'convert')
        .mockImplementation(() =>
          Promise.resolve(ConvertError.InvalidDestinationPrice)
        )

      const fallbackConvertSpy = jest
        .spyOn(telemetryService.fallbackRatesService, 'convert')
        .mockImplementation(() => Promise.resolve(10000n))

      const converted = await telemetryService.convertAmount({
        sourceAmount: 100n,
        sourceAsset: { code: 'USD', scale: 2 },
        destinationAsset: { code: 'USD', scale: 2 }
      })

      expect(aseConvertSpy).toHaveBeenCalled()
      expect(fallbackConvertSpy).toHaveBeenCalled()
      expect(converted).toBe(10000n)
    })
  })
})
