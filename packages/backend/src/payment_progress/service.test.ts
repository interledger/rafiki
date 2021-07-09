import { v4 as uuid } from 'uuid'
import Knex from 'knex'

import { PaymentProgressService } from './service'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'

describe('PaymentProgressService', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let paymentProgressService: PaymentProgressService
  let knex: Knex

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      paymentProgressService = await deps.use('paymentProgressService')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe('create', (): void => {
    it('creates a PaymentProgress', async () => {
      const id = uuid()
      const progress = await paymentProgressService.create(id)
      expect(progress.amountSent).toEqual(BigInt(0))
      expect(progress.amountDelivered).toEqual(BigInt(0))

      const progress2 = await paymentProgressService.get(id)
      if (!progress2) throw new Error()
      expect(progress2.id).toEqual(id)
    })
  })

  describe('increase', (): void => {
    it('updates the amounts', async () => {
      const id = uuid()
      await paymentProgressService.create(id)

      await paymentProgressService.increase(id, {
        amountSent: BigInt(2),
        amountDelivered: BigInt(3)
      })

      await expect(paymentProgressService.get(id)).resolves.toMatchObject({
        amountSent: BigInt(2),
        amountDelivered: BigInt(3)
      })
    })

    it('does not decrease the amounts', async () => {
      const id = uuid()
      await paymentProgressService.create(id)

      await paymentProgressService.increase(id, {
        amountSent: BigInt(2),
        amountDelivered: BigInt(3)
      })
      await paymentProgressService.increase(id, {
        amountSent: BigInt(1),
        amountDelivered: BigInt(2)
      })

      await expect(paymentProgressService.get(id)).resolves.toMatchObject({
        amountSent: BigInt(2),
        amountDelivered: BigInt(3)
      })
    })
  })
})
