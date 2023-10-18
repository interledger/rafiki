import { Knex } from 'knex'
import { createTestApp, TestContainer } from '../../tests/app'
import { ConnectionService } from './service'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createWalletAddress } from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import assert from 'assert'

describe('Connection Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let connectionService: ConnectionService
  let knex: Knex
  let incomingPayment: IncomingPayment

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    connectionService = await deps.use('connectionService')
    knex = appContainer.knex
  })

  beforeEach(async (): Promise<void> => {
    const { id: walletAddressId } = await createWalletAddress(deps)
    incomingPayment = await createIncomingPayment(deps, {
      walletAddressId
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns connection for incoming payment', (): void => {
      const connection = connectionService.get(incomingPayment)
      assert.ok(connection)
      expect(connection).toMatchObject({
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret: expect.any(Buffer)
      })
    })

    test.each`
      state
      ${IncomingPaymentState.Completed}
      ${IncomingPaymentState.Expired}
    `(
      `returns undefined for $state incoming payment`,
      async ({ state }): Promise<void> => {
        await incomingPayment.$query(knex).patch({
          state,
          expiresAt:
            state === IncomingPaymentState.Expired ? new Date() : undefined
        })
        expect(connectionService.get(incomingPayment)).toBeUndefined()
      }
    )
  })
})
