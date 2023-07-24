import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../../app'
import { TestContainer, createTestApp } from '../../../tests/app'
import { initIocContainer } from '../../..'
import { Config, IAppConfig } from '../../../config/app'
import { CombinedPaymentService } from './service'
import { Knex } from 'knex'
import { truncateTables } from '../../../tests/tableManager'
import { getPageTests } from '../../../shared/baseModel.test'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createAsset } from '../../../tests/asset'
import {
  MockPaymentPointer,
  createPaymentPointer
} from '../../../tests/paymentPointer'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { Pagination } from '../../../shared/baseModel'
import { CombinedPayment, PaymentType } from './model'
import { Asset } from '../../../asset/model'
import { IncomingPaymentError } from '../incoming/errors'
import { IncomingPaymentService } from '../incoming/service'
import { OutgoingPaymentService } from '../outgoing/service'
import { OutgoingPaymentError } from '../outgoing/errors'

describe('Combined Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let config: IAppConfig
  let knex: Knex
  let combinedPaymentService: CombinedPaymentService
  let incomingPaymentService: IncomingPaymentService
  let outgoingPaymentService: OutgoingPaymentService
  let sendAsset: Asset
  let sendPaymentPointerId: string
  let receiveAsset: Asset
  let receivePaymentPointer: MockPaymentPointer

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    combinedPaymentService = await deps.use('combinedPaymentService')
    incomingPaymentService = await deps.use('incomingPaymentService')
    outgoingPaymentService = await deps.use('outgoingPaymentService')
    config = await deps.use('config')
  })

  beforeEach(async (): Promise<void> => {
    sendAsset = await createAsset(deps)
    receiveAsset = await createAsset(deps)
    sendPaymentPointerId = (
      await createPaymentPointer(deps, { assetId: sendAsset.id })
    ).id
    receivePaymentPointer = await createPaymentPointer(deps, {
      assetId: receiveAsset.id,
      mockServerPort: appContainer.openPaymentsPort
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  async function setupOutgoingPayment(deps: IocContract<AppServices>) {
    const incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId: receivePaymentPointer.id
    })
    const receiverUrl = incomingPayment.getUrl(receivePaymentPointer)

    const outgoingPayment = await createOutgoingPayment(deps, {
      paymentPointerId: sendPaymentPointerId,
      receiver: receiverUrl,
      sendAmount: {
        value: BigInt(123),
        assetCode: sendAsset.code,
        assetScale: sendAsset.scale
      },
      validDestination: false
    })

    return {
      outgoingPayment,
      incomingPayment
    }
  }

  describe('CombinedPayment Service', (): void => {
    describe('getCombinedPaymentsPage', (): void => {
      async function createCombinedPayment(
        deps: IocContract<AppServices>
      ): Promise<CombinedPayment> {
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: receivePaymentPointer.id
        })
        return CombinedPayment.fromJson(incomingPayment)
      }
      async function getCombinedPaymentsPage(pagination?: Pagination) {
        const payments = await combinedPaymentService.getPage({ pagination })
        return payments.map(
          (payment) => payment.payment
        ) as unknown as CombinedPayment[]
      }
      getPageTests({
        createModel: () => createCombinedPayment(deps),
        getPage: (pagination?: Pagination) =>
          getCombinedPaymentsPage(pagination)
      })

      test('should return empty array if no payments', async (): Promise<void> => {
        const payments = await combinedPaymentService.getPage()
        expect(payments).toEqual([])
      })

      test('can get all', async (): Promise<void> => {
        const setupDetails = await setupOutgoingPayment(deps)
        const payments = await combinedPaymentService.getPage()
        console.log({ payments })
        expect(payments.length).toEqual(2)
        expect(
          payments.find((p) => p.type === PaymentType.Outgoing)
        ).toMatchObject({
          type: PaymentType.Outgoing,
          payment: setupDetails.outgoingPayment
        })
        expect(
          payments.find((p) => p.type === PaymentType.Incoming)
        ).toMatchObject({
          type: PaymentType.Incoming,
          payment: setupDetails.incomingPayment
        })
      })

      test('can filter by paymentPointerId', async (): Promise<void> => {
        const setupDetails = await setupOutgoingPayment(deps)
        const payments = await combinedPaymentService.getPage({
          filter: {
            paymentPointerId: {
              in: [setupDetails.incomingPayment.paymentPointerId]
            }
          }
        })
        expect(payments.length).toEqual(1)
        expect(payments[0].type).toEqual(PaymentType.Incoming)
        expect(payments[0].payment.paymentPointerId).toEqual(
          setupDetails.incomingPayment.paymentPointerId
        )
      })

      test('can filter by type', async (): Promise<void> => {
        const setupDetails = await setupOutgoingPayment(deps)
        const payments = await combinedPaymentService.getPage({
          filter: {
            type: {
              in: [PaymentType.Outgoing]
            }
          }
        })
        expect(payments.length).toEqual(1)
        expect(payments[0].type).toEqual(PaymentType.Outgoing)
        expect(payments[0].payment).toMatchObject(setupDetails.outgoingPayment)
      })

      test('throws an error when incoming payment is not found', async (): Promise<void> => {
        await setupOutgoingPayment(deps)

        incomingPaymentService.get = jest.fn().mockResolvedValue(undefined)

        await expect(combinedPaymentService.getPage()).rejects.toThrow(
          Error(IncomingPaymentError.UnknownPayment)
        )
      })

      test('throws an error when incoming payment is not found', async (): Promise<void> => {
        await setupOutgoingPayment(deps)

        outgoingPaymentService.get = jest.fn().mockResolvedValue(undefined)

        await expect(combinedPaymentService.getPage()).rejects.toThrow(
          Error(OutgoingPaymentError.UnknownPayment)
        )
      })
    })
  })
})
