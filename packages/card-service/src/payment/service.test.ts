import { createPaymentService, PaymentTimeoutError } from './service'
import { paymentWaitMap } from './wait-map'
import { PaymentEventEnum, PaymentBody } from './types'
import { initIocContainer } from '../index'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { AppServices } from '../app'
import { IocContract } from '@adonisjs/fold'

describe('PaymentService', () => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let service: Awaited<ReturnType<typeof createPaymentService>>

  const paymentFixture: PaymentBody = {
    requestId: 'foo',
    card: {
      walletAddress: 'wallet123',
      transactionCounter: 1,
      expiry: '2025-12-31'
    },
    merchantWalletAddress: 'merchant456',
    incomingPaymentUrl: 'https://example.com/incoming',
    date: '2024-01-01T00:00:00Z',
    signature: 'sig',
    terminalCert: 'cert',
    terminalId: 'terminal789'
  }

  beforeAll(async () => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    service = await deps.use('paymentService')
  })

  afterEach(() => {
    paymentWaitMap.clear()
  })

  afterAll(async () => {
    await appContainer.shutdown()
  })

  describe('create', () => {
    test('resolves when paymentEvent is received', async () => {
      setTimeout(() => {
        const d = paymentWaitMap.get('foo')
        d?.resolve({
          requestId: 'foo',
          outgoingPaymentId: 'bar',
          result: { code: PaymentEventEnum.Completed }
        })
      }, 10)

      const result = await service.create(paymentFixture)
      expect(result).toEqual({
        requestId: 'foo',
        outgoingPaymentId: 'bar',
        result: { code: PaymentEventEnum.Completed }
      })
    })

    test('throws PaymentTimeoutError on timeout', async () => {
      const timeoutFixture = { ...paymentFixture, requestId: 'timeout' }
      await expect(service.create(timeoutFixture)).rejects.toThrow(
        PaymentTimeoutError
      )
    })
  })
})
