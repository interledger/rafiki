import { ValueType } from '@opentelemetry/api'
import { ConvertError } from '../rates/service'
import { Asset } from '../rates/util'
import { MockTelemetryService } from '../tests/telemetry'
import { privacy } from './privacy'
import { collectTelemetryAmount } from './transaction-amount'
import { Logger } from 'pino'

const telemetryService = new MockTelemetryService()
const mockLogger = { error: jest.fn() } as unknown as Logger

const asset: Asset = { code: 'USD', scale: 2 }

describe('Telemetry Amount Collection', function () {
  it('should not collect telemetry when conversion returns InvalidDestinationPrice', async () => {
    const convertSpy = jest
      .spyOn(telemetryService, 'convertAmount')
      .mockImplementation(() =>
        Promise.resolve(ConvertError.InvalidDestinationPrice)
      )

    const addSpy = jest.spyOn(
      telemetryService.getOrCreateMetric('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )

    await collectTelemetryAmount(telemetryService, mockLogger, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(addSpy).not.toHaveBeenCalled()
  })
  it('should handle invalid amount by not collecting telemetry', async () => {
    const convertSpy = jest
      .spyOn(telemetryService, 'convertAmount')
      .mockImplementation(() =>
        Promise.resolve(ConvertError.InvalidDestinationPrice)
      )

    await collectTelemetryAmount(telemetryService, mockLogger, {
      amount: 0n,
      asset
    })

    expect(convertSpy).not.toHaveBeenCalled()
  })

  it('should collect telemetry when conversion is successful', async () => {
    const convertSpy = jest
      .spyOn(telemetryService, 'convertAmount')
      .mockImplementation(() => Promise.resolve(10000n))
    const addSpy = jest.spyOn(
      telemetryService.getOrCreateMetric('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )
    jest.spyOn(privacy, 'applyPrivacy').mockReturnValue(12000)

    await collectTelemetryAmount(telemetryService, mockLogger, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledWith(12000)
  })

  it('should apply privacy to the collected telemetry', async () => {
    const convertSpy = jest
      .spyOn(telemetryService, 'convertAmount')
      .mockImplementation(() => Promise.resolve(10000n))
    const privacySpy = jest
      .spyOn(privacy, 'applyPrivacy')
      .mockReturnValue(12000)
    const addSpy = jest.spyOn(
      telemetryService.getOrCreateMetric('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )

    await collectTelemetryAmount(telemetryService, mockLogger, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(privacySpy).toHaveBeenCalledWith(Number(10000n))
    expect(addSpy).toHaveBeenCalledWith(12000)
  })
})
