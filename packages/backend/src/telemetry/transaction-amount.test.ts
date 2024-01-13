import { ValueType } from '@opentelemetry/api'
import { ConvertError } from '../rates/service'
import { Asset } from '../rates/util'
import { privacy } from './privacy'
import { MockRatesService, MockTelemetryService } from './mocks'
import { collectTelemetryAmount, convertAmount } from './transaction-amount'

const telemetryService = new MockTelemetryService()
const aseRates = new MockRatesService()
const telemetryRates = new MockRatesService()

const asset: Asset = { code: 'USD', scale: 2 }

describe('Telemetry Amount Collection', function () {
  it('should not collect telemetry when conversion returns InvalidDestinationPrice', async () => {
    const convertSpy = jest
      .spyOn(aseRates, 'convert')
      .mockImplementation(() =>
        Promise.resolve(ConvertError.InvalidDestinationPrice)
      )

    const addSpy = jest.spyOn(
      telemetryService.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )

    await collectTelemetryAmount(telemetryService, aseRates, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(addSpy).not.toHaveBeenCalled()
  })
  it('should handle invalid amount by not collecting telemetry', async () => {
    const convertSpy = jest
      .spyOn(aseRates, 'convert')
      .mockImplementation(() =>
        Promise.resolve(ConvertError.InvalidDestinationPrice)
      )

    await collectTelemetryAmount(telemetryService, aseRates, {
      amount: 0n,
      asset
    })

    expect(convertSpy).not.toHaveBeenCalled()
  })

  it('should collect telemetry when conversion is successful', async () => {
    const convertSpy = jest
      .spyOn(aseRates, 'convert')
      .mockImplementation(() => Promise.resolve(10000n))
    const addSpy = jest.spyOn(
      telemetryService.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )
    jest.spyOn(privacy, 'applyPrivacy').mockReturnValue(12000)

    await collectTelemetryAmount(telemetryService, aseRates, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(addSpy).toHaveBeenCalledWith(12000)
  })

  it('should try to convert using external rates from telemetryRatesService when aseRatesService fails', async () => {
    const aseConvertSpy = jest
      .spyOn(aseRates, 'convert')
      .mockImplementation(() =>
        Promise.reject(ConvertError.InvalidDestinationPrice)
      )
    const telemetryConvertSpy = jest
      .spyOn(telemetryRates, 'convert')
      .mockImplementation(() => Promise.resolve(10000n))

    const converted = await convertAmount(aseRates, telemetryRates, {
      sourceAmount: 100n,
      sourceAsset: asset,
      destinationAsset: { code: 'USD', scale: 2 }
    })

    expect(aseConvertSpy).toHaveBeenCalled()
    expect(telemetryConvertSpy).toHaveBeenCalled()
    expect(converted).toBe(10000n)
  })

  it('should apply privacy to the collected telemetry', async () => {
    const convertSpy = jest
      .spyOn(aseRates, 'convert')
      .mockImplementation(() => Promise.resolve(10000n))
    const privacySpy = jest
      .spyOn(privacy, 'applyPrivacy')
      .mockReturnValue(12000)
    const addSpy = jest.spyOn(
      telemetryService.getOrCreate('transactions_amount', {
        description: 'Amount sent through the network',
        valueType: ValueType.DOUBLE
      }),
      'add'
    )

    await collectTelemetryAmount(telemetryService, aseRates, {
      amount: 100n,
      asset
    })

    expect(convertSpy).toHaveBeenCalled()
    expect(privacySpy).toHaveBeenCalledWith(Number(10000n))
    expect(addSpy).toHaveBeenCalledWith(12000)
  })
})
