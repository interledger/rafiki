import { Knex } from 'knex'
import { gql } from 'apollo-server-koa'

import { getPageTests } from './page.test'
import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { v4 as uuid } from 'uuid'
import { GrantReference } from '../../open_payments/grantReference/model'
import { GrantReferenceService } from '../../open_payments/grantReference/service'
import { IncomingPayment as IncomingPaymentModel } from '../../open_payments/payment/incoming/model'
import { IncomingPaymentService } from '../../open_payments/payment/incoming/service'
import {
  IncomingPaymentResponse,
  IncomingPaymentState as SchemaPaymentState
} from '../generated/graphql'
import {
  IncomingPaymentError,
  errorToMessage
} from '../../open_payments/payment/incoming/errors'

describe('Incoming Payment Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let paymentPointerId: string
  let grantReferenceService: GrantReferenceService
  let grantRef: GrantReference
  let incomingPaymentService: IncomingPaymentService

  const asset = randomAsset()

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = await deps.use('knex')
    grantReferenceService = await deps.use('grantReferenceService')
    incomingPaymentService = await deps.use('incomingPaymentService')
  })

  afterAll(async (): Promise<void> => {
    await truncateTables(knex)
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  const createPayment = async (options: {
    paymentPointerId: string
    description?: string
    externalRef?: string
  }): Promise<IncomingPaymentModel> => {
    grantRef = await grantReferenceService.create({
      id: uuid(),
      clientId: uuid()
    })
    return await createIncomingPayment(deps, {
      ...options,
      expiresAt: new Date(Date.now() + 30_000),
      incomingAmount: {
        value: BigInt(56),
        assetCode: asset.code,
        assetScale: asset.scale
      },
      grantId: grantRef.id
    })
  }

  describe('Payment pointer incoming payments', (): void => {
    beforeEach(async (): Promise<void> => {
      paymentPointerId = (await createPaymentPointer(deps, { asset })).id
      grantRef = await grantReferenceService.create({
        id: uuid(),
        clientId: uuid()
      })
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () =>
        createIncomingPayment(deps, {
          paymentPointerId,
          grantId: grantRef.id,
          incomingAmount: {
            value: BigInt(123),
            assetCode: asset.code,
            assetScale: asset.scale
          },
          expiresAt: new Date(Date.now() + 30_000),
          description: `IncomingPayment`,
          externalRef: '#123'
        }),
      pagedQuery: 'incomingPayments',
      parent: {
        query: 'paymentPointer',
        getId: () => paymentPointerId
      }
    })
  })

  describe('Mutation.createIncomingPayment', (): void => {
    test.each`
      description  | externalRef  | desc
      ${'rent'}    | ${undefined} | ${'description'}
      ${undefined} | ${'202201'}  | ${'externalRef'}
    `('200 ($desc)', async ({ description, externalRef }): Promise<void> => {
      const { id: paymentPointerId } = await createPaymentPointer(deps, {
        asset
      })
      const payment = await createPayment({
        paymentPointerId,
        description,
        externalRef
      })

      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockResolvedValueOnce(payment)

      const input = {
        paymentPointerId: payment.paymentPointerId,
        incomingAmount: payment.incomingAmount,
        expiresAt: payment.expiresAt
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateIncomingPayment(
              $input: CreateIncomingPaymentInput!
            ) {
              createIncomingPayment(input: $input) {
                code
                success
                payment {
                  id
                  state
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): IncomingPaymentResponse => query.data?.createIncomingPayment
        )

      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.payment?.id).toBe(payment.id)
      expect(query.payment?.state).toBe(SchemaPaymentState.Pending)
    })

    test('400', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockResolvedValueOnce(IncomingPaymentError.UnknownPaymentPointer)

      const input = {
        paymentPointerId: uuid(),
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000)
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateIncomingPayment(
              $input: CreateIncomingPaymentInput!
            ) {
              createIncomingPayment(input: $input) {
                code
                success
                message
                payment {
                  id
                  state
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): IncomingPaymentResponse => query.data?.createIncomingPayment
        )
      expect(query.code).toBe('404')
      expect(query.success).toBe(false)
      expect(query.message).toBe(
        errorToMessage[IncomingPaymentError.UnknownPaymentPointer]
      )
      expect(query.payment).toBeNull()
      expect(createSpy).toHaveBeenCalledWith(input)
    })

    test('500', async (): Promise<void> => {
      const createSpy = jest
        .spyOn(incomingPaymentService, 'create')
        .mockRejectedValueOnce(new Error('unexpected'))

      const input = {
        paymentPointerId: uuid(),
        incomingAmount: {
          value: BigInt(123),
          assetCode: asset.code,
          assetScale: asset.scale
        },
        expiresAt: new Date(Date.now() + 30_000)
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation CreateIncomingPayment(
              $input: CreateIncomingPaymentInput!
            ) {
              createIncomingPayment(input: $input) {
                code
                success
                message
                payment {
                  id
                  state
                }
              }
            }
          `,
          variables: { input }
        })
        .then(
          (query): IncomingPaymentResponse => query.data?.createIncomingPayment
        )
      expect(createSpy).toHaveBeenCalledWith(input)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('Error trying to create incoming payment')
      expect(query.payment).toBeNull()
    })
  })
})
