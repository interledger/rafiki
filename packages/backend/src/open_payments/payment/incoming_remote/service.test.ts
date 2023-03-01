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
  mockPendingGrant,
  mockGrant,
  mockPaymentPointer,
  mockIncomingPaymentWithConnection
} from 'open-payments'
import { GrantService } from '../../grant/service'
import { RemoteIncomingPaymentError } from './errors'
import { AccessToken } from 'open-payments'
import { Grant } from '../../grant/model'

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
      authServer: paymentPointer.authServer,
      managementUrl: `${paymentPointer.authServer}/token/aq1sw2de3fr4`
    }

    test('throws if payment pointer not found', async () => {
      const clientGetPaymentPointerSpy = jest
        .spyOn(openPaymentsClient.paymentPointer, 'get')
        .mockImplementationOnce(() => {
          throw new Error('No payment pointer')
        })

      await expect(
        remoteIncomingPaymentService.create({
          paymentPointerUrl: paymentPointer.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.UnknownPaymentPointer)
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

      test('returns error if grant expired and token cannot be rotated', async () => {
        await grantService.create({
          ...grantOptions,
          expiresIn: -10
        })
        const clientRequestRotateTokenSpy = jest
          .spyOn(openPaymentsClient.token, 'rotate')
          .mockRejectedValueOnce(new Error('Error in rotating client'))

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrowError('Error in rotating client')
        expect(clientRequestRotateTokenSpy).toHaveBeenCalled()
      })

      test('returns error if grant expired and management url cannot be retrieved', async () => {
        const grant = await grantService.create({
          ...grantOptions,
          expiresIn: -10
        })
        const getExistingGrantSpy = jest
          .spyOn(grantService, 'get')
          .mockResolvedValueOnce({
            ...grant,
            authServer: undefined,
            expired: true
          } as Grant)

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).rejects.toThrow('unknown auth server')
        expect(getExistingGrantSpy).toHaveBeenCalled()
      })
      test.each`
        incomingAmount | expiresAt                        | description                | externalRef
        ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
      `('creates remote incoming payment ($#)', async (args): Promise<void> => {
        const mockedIncomingPayment = mockIncomingPaymentWithConnection({
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

      test('returns error if fails to create the incoming payment', async () => {
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
        ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      })

      describe.each`
        incomingAmount | expiresAt                        | description                | externalRef
        ${undefined}   | ${undefined}                     | ${undefined}               | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${'Test incoming payment'} | ${'#123'}
      `('creates remote incoming payment ($#)', (args): void => {
        const newToken = {
          access_token: {
            value: 'T0OS9M2PMHKUR64TB8N6BW7OZB8CDFONP219RP1L',
            manage: `${grantOptions.authServer}/token/d3f288c2-0b41-42f0-9b2f-66ff4bf45a7a`,
            expires_in: 3600,
            access: [
              {
                type: grantOptions.accessType,
                actions: grantOptions.accessActions
              }
            ]
          }
        } as AccessToken
        const mockedIncomingPayment = mockIncomingPaymentWithConnection({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        test.each`
          grantExpired
          ${false}
          ${true}
        `(
          '- grant expired: $grantExpired',
          async ({ grantExpired }): Promise<void> => {
            const options = !grantExpired
              ? grantOptions
              : { ...grantOptions, expiresIn: -10 }
            const grant = await grantService.create(options)

            const clientCreateIncomingPaymentSpy = jest
              .spyOn(openPaymentsClient.incomingPayment, 'create')
              .mockResolvedValueOnce(mockedIncomingPayment)

            const clientRequestRotateTokenSpy = jest
              .spyOn(openPaymentsClient.token, 'rotate')
              .mockResolvedValueOnce(newToken)

            const incomingPayment = await remoteIncomingPaymentService.create({
              ...args,
              paymentPointerUrl: paymentPointer.id
            })

            expect(incomingPayment).toStrictEqual(mockedIncomingPayment)
            expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledWith(
              {
                paymentPointer: paymentPointer.id,
                accessToken: grant.expired
                  ? newToken.access_token.value
                  : grant.accessToken
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
            if (grantExpired) {
              expect(clientRequestRotateTokenSpy).toHaveBeenCalledWith({
                url: grantOptions.managementUrl,
                accessToken: grantOptions.accessToken
              })
            } else {
              expect(clientRequestRotateTokenSpy).not.toHaveBeenCalled()
            }
          }
        )
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
        const mockedIncomingPayment = mockIncomingPaymentWithConnection({
          ...args,
          paymentPointerUrl: paymentPointer.id
        })

        const grant = mockGrant()

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
          expiresIn: grant.access_token.expires_in,
          managementUrl: grant.access_token.manage
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

      test('returns error if created grant is interactive', async () => {
        jest
          .spyOn(openPaymentsClient.grant, 'request')
          .mockResolvedValueOnce(mockPendingGrant())

        await expect(
          remoteIncomingPaymentService.create({
            paymentPointerUrl: paymentPointer.id
          })
        ).resolves.toEqual(RemoteIncomingPaymentError.InvalidGrant)
      })
    })
  })
})
