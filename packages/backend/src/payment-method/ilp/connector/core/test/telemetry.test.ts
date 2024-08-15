import { TelemetryService } from '../../../../../telemetry/service'
import { initIocContainer } from '../../../../../index'
import { Config } from '../../../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../../../../app'
import {
  incrementPreparePacketCount,
  incrementFulfillOrRejectPacketCount,
  incrementAmount
} from '../telemetry'
import { IlpResponse } from '../middleware/ilp-packet'
import { IlpFulfillFactory, IlpRejectFactory } from '../factories'
import { ValueType } from '@opentelemetry/api'

describe('Connector Core Telemetry', () => {
  let deps: IocContract<AppServices>
  let telemetryService: TelemetryService
  let unfulfillable: boolean
  let prepareAmount: string

  beforeAll(async (): Promise<void> => {
    unfulfillable = false
    prepareAmount = '100'
    deps = initIocContainer({
      ...Config,
      enableTelemetry: true
    })

    telemetryService = await deps.use('telemetry')!
  })

  afterAll(async (): Promise<void> => {
    jest.restoreAllMocks()
  })

  it('incrementPreparePacketCount should create a packet_count_prepare counter and increment it by one', () => {
    const incrementCounterSpy = jest
      .spyOn(telemetryService!, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())
    const amount = 1
    const name = 'packet_count_prepare'
    const attributes = {
      description: 'Count of prepare packets that are sent'
    }

    incrementPreparePacketCount(unfulfillable, prepareAmount, telemetryService)

    expect(incrementCounterSpy).toHaveBeenCalledWith(name, amount, attributes)
  })

  it('incrementFulfillOrRejectPacketCount should create a packet_count_fulfill counter and increment it by one when there is a fulfill response', () => {
    const incrementCounterSpy = jest
      .spyOn(telemetryService!, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())
    const amount = 1
    const name = 'packet_count_fulfill'
    const prepareAmount = '100'
    const attributes = {
      description: 'Count of fulfill packets'
    }
    const response = new IlpResponse()
    response.fulfill = IlpFulfillFactory.build()

    incrementFulfillOrRejectPacketCount(
      unfulfillable,
      prepareAmount,
      response,
      telemetryService
    )

    expect(incrementCounterSpy).toHaveBeenCalledWith(name, amount, attributes)
  })

  it('incrementFulfillOrRejectPacketCount should create a packet_count_reject counter and increment it by one when there is a reject response', () => {
    const incrementCounterSpy = jest
      .spyOn(telemetryService!, 'incrementCounter')
      .mockImplementation(() => Promise.resolve())
    const amount = 1
    const name = 'packet_count_reject'
    const prepareAmount = '100'
    const attributes = {
      description: 'Count of reject packets'
    }
    const response = new IlpResponse()
    response.reject = IlpRejectFactory.build()

    incrementFulfillOrRejectPacketCount(
      unfulfillable,
      prepareAmount,
      response,
      telemetryService
    )

    expect(incrementCounterSpy).toHaveBeenCalledWith(name, amount, attributes)
  })

  it('incrementAmount should create a packet_amount_fulfill counter and increment it by one', () => {
    const incrementCounterSpy = jest
      .spyOn(telemetryService!, 'incrementCounterWithTransactionAmount')
      .mockImplementation(() => Promise.resolve())

    const amount = { value: 100n, assetCode: 'USD', assetScale: 2 }
    const name = 'packet_amount_fulfill'
    const code = 'USD'
    const scale = 2
    const prepareAmount = '100'
    const attributes = {
      description: 'Amount sent through the network',
      valueType: ValueType.DOUBLE
    }
    const response = new IlpResponse()
    response.fulfill = IlpFulfillFactory.build()

    incrementAmount(
      unfulfillable,
      prepareAmount,
      response,
      code,
      scale,
      telemetryService
    )

    expect(incrementCounterSpy).toHaveBeenCalledWith(name, amount, attributes)
  })
})
