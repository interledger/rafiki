import crypto from 'node:crypto'
import { v4 as uuid } from 'uuid'
import assert from 'assert'
import { Knex } from 'knex'
import { Config, IAppConfig } from '../../../config/app'
import { createTestApp, TestContainer } from '../../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import {
  OutgoingPaymentEventError,
  OutgoingPaymentEvent,
  OutgoingPaymentEventType,
  OutgoingPayment
} from './model'
import { createOutgoingPayment } from '../../../tests/outgoingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { IncomingPaymentInitiationReason } from '../incoming/types'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { OutgoingPaymentService } from './service'
import { faker } from '@faker-js/faker'
import { isFundingError, isOutgoingPaymentError } from './errors'
import { withConfigOverride } from '../../../tests/helpers'
import { WalletAddress } from '../../wallet_address/model'

describe('Outgoing Payment Event Model', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let config: IAppConfig

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    config = await deps.use('config')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('beforeInsert', (): void => {
    test.each(
      Object.values(OutgoingPaymentEventType).map((type) => ({
        type,
        error: OutgoingPaymentEventError.OutgoingPaymentIdRequired
      }))
    )(
      'Outgoing Payment Id is required',
      async ({ type, error }): Promise<void> => {
        expect(
          OutgoingPaymentEvent.query(knex).insert({
            type
          })
        ).rejects.toThrow(error)
      }
    )
  })

  describe('getDataToTransmit', (): void => {
    let outgoingPaymentService: OutgoingPaymentService
    let walletAddress: WalletAddress
    let payment: OutgoingPayment
    const dbEncryptionOverride: Partial<IAppConfig> = {
      dbEncryptionSecret: crypto.randomBytes(32).toString('base64'),
      dbEncryptionIv: crypto.randomBytes(32).toString('base64')
    }
    beforeAll(async (): Promise<void> => {
      outgoingPaymentService = await deps.use('outgoingPaymentService')
    })

    beforeEach(async (): Promise<void> => {
      walletAddress = await createWalletAddress(deps)
      const incomingPayment = await createIncomingPayment(deps, {
        walletAddressId: walletAddress.id,
        tenantId: walletAddress.tenantId,
        initiationReason: IncomingPaymentInitiationReason.Admin
      })
      const receiver = incomingPayment.getUrl(config.openPaymentsUrl)
      payment = await createOutgoingPayment(deps, {
        tenantId: walletAddress.tenantId,
        walletAddressId: walletAddress.id,
        receiver,
        method: 'ilp',
        debitAmount: {
          value: BigInt(123),
          assetCode: walletAddress.asset.code,
          assetScale: walletAddress.asset.scale
        }
      })
    })

    test(
      'can decrypt data',
      withConfigOverride(
        () => config,
        dbEncryptionOverride,
        async (): Promise<void> => {
          const decipherSpy = jest.spyOn(crypto, 'createDecipheriv')
          const dataToTransmit = { data: faker.internet.email() }
          const paymentWithData = await outgoingPaymentService.fund({
            id: payment.id,
            tenantId: walletAddress.tenantId,
            amount: payment.debitAmount.value,
            transferId: uuid(),
            dataToTransmit: JSON.stringify(dataToTransmit)
          })

          assert.ok(!isOutgoingPaymentError(paymentWithData))
          assert.ok(!isFundingError(paymentWithData))
          expect(
            paymentWithData.getDataToTransmit(
              config.dbEncryptionSecret,
              config.dbEncryptionIv
            )
          ).toEqual(JSON.stringify(dataToTransmit))
          expect(decipherSpy).toHaveBeenCalled()
        }
      )
    )

    test(
      'returns data as-is without configured key env variable',
      withConfigOverride(
        () => config,
        {
          ...dbEncryptionOverride,
          dbEncryptionSecret: undefined
        },
        async (): Promise<void> => {
          const decipherSpy = jest.spyOn(crypto, 'createDecipheriv')
          const dataToTransmit = { data: faker.internet.email() }
          const paymentWithData = await outgoingPaymentService.fund({
            id: payment.id,
            tenantId: walletAddress.tenantId,
            amount: payment.debitAmount.value,
            transferId: uuid(),
            dataToTransmit: JSON.stringify(dataToTransmit)
          })

          assert.ok(!isOutgoingPaymentError(paymentWithData))
          assert.ok(!isFundingError(paymentWithData))
          expect(
            paymentWithData.getDataToTransmit(
              config.dbEncryptionSecret,
              config.dbEncryptionIv
            )
          ).toEqual(JSON.stringify(dataToTransmit))
          expect(decipherSpy).not.toHaveBeenCalled()
        }
      )
    )

    test(
      'returns data as-is without configured iv env variable',
      withConfigOverride(
        () => config,
        {
          ...dbEncryptionOverride,
          dbEncryptionIv: undefined
        },
        async (): Promise<void> => {
          const decipherSpy = jest.spyOn(crypto, 'createDecipheriv')
          const dataToTransmit = { data: faker.internet.email() }
          const paymentWithData = await outgoingPaymentService.fund({
            id: payment.id,
            tenantId: walletAddress.tenantId,
            amount: payment.debitAmount.value,
            transferId: uuid(),
            dataToTransmit: JSON.stringify(dataToTransmit)
          })

          assert.ok(!isOutgoingPaymentError(paymentWithData))
          assert.ok(!isFundingError(paymentWithData))
          expect(
            paymentWithData.getDataToTransmit(
              config.dbEncryptionSecret,
              config.dbEncryptionIv
            )
          ).toEqual(JSON.stringify(dataToTransmit))
          expect(decipherSpy).not.toHaveBeenCalled()
        }
      )
    )
  })
})
