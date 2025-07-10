import { v4 as uuid } from 'uuid'

import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { createCardPayment, randomCardPayment } from '../tests/cardPayment'
import { truncateTables } from '../tests/tableManager'
import { CardPayment } from './model'
import {
  AuditLogService,
  createAuditLogService,
  UpdateCardPaymentOptions
} from './service'

describe('AuditLogService', (): void => {
  let deps: IocContract<AppServices>
  let auditLogService: AuditLogService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    auditLogService = await createAuditLogService({
      logger: await deps.use('logger'),
      knex: await deps.use('knex')
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  describe('create', (): void => {
    test('CardPayment can be created and fetched', async (): Promise<void> => {
      const options = randomCardPayment()
      const cardPayment = await auditLogService.create(options)

      expect(cardPayment).toMatchObject({
        ...options,
        id: cardPayment.id,
        finalizedAt: null,
        statusCode: null,
        outgoingPaymentId: null
      })
      expect(cardPayment.id).toBeDefined()
      expect(cardPayment.createdAt).toBeInstanceOf(Date)
      expect(cardPayment.updatedAt).toBeInstanceOf(Date)
    })
  })

  describe('update', (): void => {
    let existingPayment: CardPayment

    beforeEach(async (): Promise<void> => {
      existingPayment = await createCardPayment(deps)
    })

    test('CardPayment can be updated', async (): Promise<void> => {
      const finalizedAt = new Date()
      const statusCode = 200
      const outgoingPaymentId = uuid()

      const updateOptions: UpdateCardPaymentOptions = {
        requestId: existingPayment.requestId,
        finalizedAt,
        statusCode,
        outgoingPaymentId
      }

      const updatedPayment = await auditLogService.update(updateOptions)

      expect(updatedPayment?.finalizedAt).toEqual(finalizedAt)
      expect(updatedPayment?.statusCode).toBe(statusCode)
      expect(updatedPayment?.outgoingPaymentId).toBe(outgoingPaymentId)
      expect(updatedPayment?.id).toBe(existingPayment.id)
      expect(updatedPayment?.requestId).toBe(existingPayment.requestId)
    })
  })
})
