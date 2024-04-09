import { v4 as uuid } from 'uuid'
import { QuoteService } from '../../quote/service'
import { OutgoingPaymentService } from '../outgoing/service'
import { AppServices } from '../../../app'
import { IocContract } from '@adonisjs/fold'
import { TestContainer, createTestApp } from '../../../tests/app'
import { initIocContainer } from '../../..'
import { Config } from '../../../config/app'
import { Quote } from '../../quote/model'
import { OutgoingPayment } from '../outgoing/model'
import { OutgoingPaymentCreatorService } from './service'

describe('OutgoingPaymentCreateManagerService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let createOutgoingPaymentCreatorService: OutgoingPaymentCreatorService
  let outgoingPaymentService: OutgoingPaymentService
  let quoteService: QuoteService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    createOutgoingPaymentCreatorService = await deps.use(
      'outgoingPaymentCreatorService'
    )
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    quoteService = await deps.use('quoteService')
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('should create directly from given quote without underlying quote creation', async () => {
      const createOptions = { quoteId: uuid(), walletAddressId: uuid() }
      const mockOutgoingPayment = { id: uuid() } as unknown as OutgoingPayment

      const quoteSpy = jest.spyOn(quoteService, 'create')
      const outgoingPaymentSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementationOnce(async () => mockOutgoingPayment)

      const createResult =
        await createOutgoingPaymentCreatorService.create(createOptions)
      createOutgoingPaymentCreatorService
      expect(quoteSpy).not.toHaveBeenCalled()
      expect(outgoingPaymentSpy).toHaveBeenCalledWith({
        ...createOptions,
        metadata: undefined,
        client: undefined,
        grant: undefined,
        callback: undefined,
        grantLockTimeoutMs: undefined
      })
      expect(createResult).toEqual(mockOutgoingPayment)
    })
    test('should create quote first then call create outgoing payment', async () => {
      const createOptions = {
        incomingPaymentId: uuid(),
        debitAmount: { value: 500n, assetScale: 2, assetCode: 'USD' },
        walletAddressId: uuid()
      }
      const mockQuote = {
        id: { quoteId: uuid() },
        walletAddressId: createOptions.walletAddressId
      } as unknown as Quote
      const mockOutgoingPayment = { id: uuid() } as unknown as OutgoingPayment

      const quoteSpy = jest
        .spyOn(quoteService, 'create')
        .mockImplementationOnce(async () => mockQuote)
      const outgoingPaymentSpy = jest
        .spyOn(outgoingPaymentService, 'create')
        .mockImplementationOnce(async () => mockOutgoingPayment)

      const createResult =
        await createOutgoingPaymentCreatorService.create(createOptions)

      expect(quoteSpy).toHaveBeenCalledWith({
        receiver: createOptions.incomingPaymentId,
        debitAmount: createOptions.debitAmount,
        method: 'ilp',
        walletAddressId: createOptions.walletAddressId
      })
      expect(outgoingPaymentSpy).toHaveBeenCalledWith({
        walletAddressId: createOptions.walletAddressId,
        quoteId: mockQuote.id,
        metadata: undefined,
        client: undefined,
        grant: undefined,
        callback: undefined,
        grantLockTimeoutMs: undefined
      })
      expect(createResult).toEqual(mockOutgoingPayment)
    })
  })
})
