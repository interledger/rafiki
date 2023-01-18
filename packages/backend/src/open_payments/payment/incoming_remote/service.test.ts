import { Knex } from 'knex'
import { RemoteIncomingPaymentService } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { truncateTables } from '../../../tests/tableManager'
import { Amount, serializeAmount } from '../../amount'
import {
  AuthenticatedClient as OpenPaymentsClient,
  AccessAction,
  AccessType,
  mockIncomingPayment,
  mockInteractiveGrant,
  mockNonInteractiveGrant,
  mockPaymentPointer
} from 'open-payments'
import { GrantService } from '../../grant/service'

describe('Remote Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let remoteIncomingPaymentService: RemoteIncomingPaymentService
  let knex: Knex
  let openPaymentsClient: OpenPaymentsClient
  let grantService: GrantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    openPaymentsClient = await deps.use('openPaymentsClient')
    grantService = await deps.use('grantService')
    knex = appContainer.knex
    remoteIncomingPaymentService = await deps.use(
      'remoteIncomingPaymentService'
    )
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    const amount: Amount = {
      value: BigInt(123),
      assetCode: 'USD',
      assetScale: 2
    }
    const paymentPointer = mockPaymentPointer()
    const grantOptions = {
      accessType: AccessType.IncomingPayment,
      accessActions: [AccessAction.Create, AccessAction.ReadAll],
      accessToken: 'OZB8CDFONP219RP1LT0OS9M2PMHKUR64TB8N6BW7',
      authServer: paymentPointer.authServer
    }

    test('throws if payment pointer not found', async () => {
      const clientGetPaymentPointerSpy = jest
        .spyOn(openPaymentsClient.paymentPointer, 'get')
        .mockResolvedValueOnce(undefined)

      await expect(
        remoteIncomingPaymentService.create({
          paymentPointerUrl: paymentPointer.id
        })
      ).rejects.toThrow('Could not get payment pointer')
      expect(clientGetPaymentPointerSpy).toHaveBeenCalledWith({
        url: paymentPointer.id
      })
    })

    describe('with existing grant', () => {
      beforeAll(() => {
        jest
          .spyOn(openPaymentsClient.paymentPointer, 'get')
          .mockResolvedValue(paymentPointer)
      })

      test.each`
        incomingAmount | expiresAt                        | description                | externalRef
        ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
      `('creates remote incoming payment ($#)', async (args): Promise<void> => {
        const mockedIncomingPayment = mockIncomingPayment({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        const grant = await grantService.create(grantOptions)

        const clientCreateIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'create')
          .mockResolvedValueOnce(mockedIncomingPayment)

        const incomingPayment = await remoteIncomingPaymentService.create({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        expect(incomingPayment).toStrictEqual(mockedIncomingPayment)
        expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledWith(
          {
            paymentPointer: paymentPointer.id,
            accessToken: grant.accessToken
          },
          {
            ...args,
            expiresAt: args.expiresAt
              ? args.expiresAt.toISOString()
              : undefined,
            incomingAmount: args.incomingAmount
              ? serializeAmount(args.incomingAmount)
              : undefined
          }
        )
      })

      test('throws if grant expired', async () => {
        await grantService.create({
          ...grantOptions,
          expiresIn: -10
        })

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrow('Grant access token expired')
      })

      test('throws if grant does not have accessToken', async () => {
        await grantService.create({
          ...grantOptions,
          accessToken: undefined
        })

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrow('Grant has undefined accessToken')
      })

      test('throws if error when creating the incoming payment', async () => {
        await grantService.create(grantOptions)
        jest
          .spyOn(openPaymentsClient.incomingPayment, 'create')
          .mockImplementationOnce(() => {
            throw new Error('Error in client')
          })

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrow('Error creating remote incoming payment')
      })
    })

    describe('with new grant', () => {
      beforeAll(() => {
        jest
          .spyOn(openPaymentsClient.paymentPointer, 'get')
          .mockResolvedValue(paymentPointer)
      })

      test.each`
        incomingAmount | expiresAt                        | description                | externalRef
        ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
      `('creates remote incoming payment ($#)', async (args): Promise<void> => {
        const mockedIncomingPayment = mockIncomingPayment({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        const grant = mockNonInteractiveGrant()

        const clientCreateIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'create')
          .mockResolvedValueOnce(mockedIncomingPayment)

        const clientRequestGrantSpy = jest
          .spyOn(openPaymentsClient.grant, 'request')
          .mockResolvedValueOnce(grant)

        const grantCreateSpy = jest.spyOn(grantService, 'create')
        const incomingPayment = await remoteIncomingPaymentService.create({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        expect(incomingPayment).toStrictEqual(mockedIncomingPayment)
        expect(clientRequestGrantSpy).toHaveBeenCalledWith(
          { url: paymentPointer.authServer },
          {
            access_token: {
              access: [
                {
                  type: grantOptions.accessType,
                  actions: grantOptions.accessActions
                }
              ]
            },
            interact: {
              start: ['redirect']
            }
          }
        )
        expect(grantCreateSpy).toHaveBeenCalledWith({
          ...grantOptions,
          accessToken: grant.access_token.value,
          expiresIn: grant.access_token.expires_in
        })
        expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledWith(
          {
            paymentPointer: paymentPointer.id,
            accessToken: grant.access_token.value
          },
          {
            ...args,
            expiresAt: args.expiresAt
              ? args.expiresAt.toISOString()
              : undefined,
            incomingAmount: args.incomingAmount
              ? serializeAmount(args.incomingAmount)
              : undefined
          }
        )
      })

      test('throws if created grant is interactive', async () => {
        jest
          .spyOn(openPaymentsClient.grant, 'request')
          .mockResolvedValueOnce(mockInteractiveGrant())

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrow('Grant request required interaction')
      })
    })
  })
})
