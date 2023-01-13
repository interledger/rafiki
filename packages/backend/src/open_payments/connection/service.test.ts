import base64url from 'base64url'
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
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'

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
    const { id: paymentPointerId } = await createPaymentPointer(deps)
    incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId
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
      expect(connection).toMatchObject({
        id: incomingPayment.connectionId,
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret: expect.any(Buffer)
      })
      expect(connection.url).toEqual(
        `${Config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`
      )
      expect(connection.toJSON()).toEqual({
        id: connection.url,
        ilpAddress: connection.ilpAddress,
        sharedSecret: base64url(connection.sharedSecret),
        assetCode: incomingPayment.asset.code,
        assetScale: incomingPayment.asset.scale
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

  describe('getUrl', (): void => {
    test('returns connection url for incoming payment', (): void => {
      expect(connectionService.getUrl(incomingPayment)).toEqual(
        `${Config.openPaymentsUrl}/connections/${incomingPayment.connectionId}`
      )
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
