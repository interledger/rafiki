import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import {
  mockWalletAddress,
  mockIncomingPaymentWithPaymentMethods
} from '@interledger/open-payments'
import { v4 as uuid } from 'uuid'

import {
  getLocalIncomingPayment,
  ReceiverService,
  ServiceDependencies
} from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config, IAppConfig } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import {
  createWalletAddress,
  MockWalletAddress
} from '../../tests/walletAddress'
import { truncateTables } from '../../tests/tableManager'
import { WalletAddressService } from '../wallet_address/service'
import { Amount, parseAmount } from '../amount'
import { RemoteIncomingPaymentService } from '../payment/incoming_remote/service'
import { IncomingPaymentError } from '../payment/incoming/errors'
import { IncomingPaymentService } from '../payment/incoming/service'
import { createAsset } from '../../tests/asset'
import { ReceiverError } from './errors'
import { RemoteIncomingPaymentError } from '../payment/incoming_remote/errors'
import assert from 'assert'
import { Receiver } from './model'
import { IncomingPayment } from '../payment/incoming/model'
import { PaymentMethodProviderService } from '../../payment-method/provider/service'

describe('Receiver Service', (): void => {
  let deps: IocContract<AppServices>
  let config: IAppConfig
  let appContainer: TestContainer
  let receiverService: ReceiverService
  let incomingPaymentService: IncomingPaymentService
  let knex: Knex
  let walletAddressService: WalletAddressService
  let paymentMethodProviderService: PaymentMethodProviderService
  let remoteIncomingPaymentService: RemoteIncomingPaymentService
  let serviceDeps: ServiceDependencies
  let tenantId: string

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    config = await deps.use('config')
    appContainer = await createTestApp(deps)
    receiverService = await deps.use('receiverService')
    incomingPaymentService = await deps.use('incomingPaymentService')
    walletAddressService = await deps.use('walletAddressService')
    paymentMethodProviderService = await deps.use(
      'paymentMethodProviderService'
    )
    remoteIncomingPaymentService = await deps.use(
      'remoteIncomingPaymentService'
    )
    knex = appContainer.knex
    serviceDeps = {
      knex,
      config,
      logger: await deps.use('logger'),
      incomingPaymentService,
      remoteIncomingPaymentService,
      walletAddressService,
      paymentMethodProviderService,
      telemetry: await deps.use('telemetry')
    }
    tenantId = Config.operatorTenantId
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', () => {
    describe('local incoming payment', () => {
      test('resolves local incoming payment', async () => {
        const walletAddress = await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          mockServerPort: Config.openPaymentsPort
        })
        const incomingPayment = await createIncomingPayment(deps, {
          walletAddressId: walletAddress.id,
          incomingAmount: {
            value: BigInt(5),
            assetCode: walletAddress.asset.code,
            assetScale: walletAddress.asset.scale
          },
          tenantId: Config.operatorTenantId
        })

        jest
          .spyOn(paymentMethodProviderService, 'getPaymentMethods')
          .mockResolvedValueOnce([])

        await expect(
          receiverService.get(incomingPayment.getUrl(config.openPaymentsUrl))
        ).resolves.toEqual({
          assetCode: incomingPayment.receivedAmount.assetCode,
          assetScale: incomingPayment.receivedAmount.assetScale,
          incomingPayment: {
            id: incomingPayment.getUrl(config.openPaymentsUrl),
            walletAddress: walletAddress.address,
            incomingAmount: incomingPayment.incomingAmount,
            receivedAmount: incomingPayment.receivedAmount,
            completed: false,
            metadata: undefined,
            expiresAt: incomingPayment.expiresAt,
            createdAt: incomingPayment.createdAt,
            methods: []
          },
          isLocal: true
        })
      })

      describe('getLocalIncomingPayment helper', () => {
        test('returns undefined if could not parse id from url', async () => {
          const incomingPaymentServiceSpy = jest
            .spyOn(incomingPaymentService, 'get')
            .mockResolvedValueOnce(undefined)

          await expect(
            getLocalIncomingPayment(
              serviceDeps,
              `https://example.com/incoming-payments`
            )
          ).resolves.toBeUndefined()
          expect(incomingPaymentServiceSpy).not.toHaveBeenCalled()
        })

        test('returns undefined if no payment found', async () => {
          jest
            .spyOn(incomingPaymentService, 'get')
            .mockResolvedValueOnce(undefined)

          await expect(
            getLocalIncomingPayment(
              serviceDeps,
              `https://example.com/incoming-payments/${uuid()}`
            )
          ).resolves.toBeUndefined()
        })

        test('throws error if wallet address does not exist on incoming payment', async () => {
          jest.spyOn(incomingPaymentService, 'get').mockResolvedValueOnce({
            id: uuid()
          } as IncomingPayment)

          await expect(
            getLocalIncomingPayment(
              serviceDeps,
              `https://example.com/incoming-payments/${uuid()}`
            )
          ).rejects.toThrow(
            'Wallet address does not exist for incoming payment'
          )
        })

        test('returns object with empty payment methods if payment methods could not be generated', async () => {
          const walletAddress = await createWalletAddress(deps)
          const incomingPayment = await createIncomingPayment(deps, {
            walletAddressId: walletAddress.id,
            tenantId: walletAddress.tenantId
          })

          jest
            .spyOn(incomingPaymentService, 'get')
            .mockResolvedValueOnce(incomingPayment)

          jest
            .spyOn(paymentMethodProviderService, 'getPaymentMethods')
            .mockResolvedValueOnce([])

          await expect(
            getLocalIncomingPayment(
              serviceDeps,
              `https://example.com/incoming-payments/${incomingPayment.id}`
            )
          ).resolves.toMatchObject({
            methods: []
          })
        })
      })
    })

    describe('remote incoming payment', () => {
      test('gets receiver from remote incoming payment', async () => {
        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods()

        jest
          .spyOn(incomingPaymentService, 'get')
          .mockResolvedValueOnce(undefined)

        jest
          .spyOn(remoteIncomingPaymentService, 'get')
          .mockResolvedValueOnce(mockedIncomingPayment)

        await expect(
          receiverService.get(mockedIncomingPayment.id)
        ).resolves.toEqual({
          assetCode: mockedIncomingPayment.receivedAmount.assetCode,
          assetScale: mockedIncomingPayment.receivedAmount.assetScale,
          incomingPayment: {
            id: mockedIncomingPayment.id,
            walletAddress: mockedIncomingPayment.walletAddress,
            incomingAmount: mockedIncomingPayment.incomingAmount
              ? parseAmount(mockedIncomingPayment.incomingAmount)
              : undefined,
            receivedAmount: parseAmount(mockedIncomingPayment.receivedAmount),
            completed: mockedIncomingPayment.completed,
            metadata: mockedIncomingPayment.metadata,
            expiresAt: mockedIncomingPayment.expiresAt
              ? new Date(mockedIncomingPayment.expiresAt)
              : undefined,
            createdAt: new Date(mockedIncomingPayment.createdAt),
            methods: [
              {
                type: 'ilp',
                ilpAddress: expect.any(String),
                sharedSecret: expect.any(String)
              }
            ]
          },
          isLocal: false
        })
      })

      test('returns undefined if could not get remote incoming payment', async () => {
        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods()

        const localIncomingPaymentServiceGetSpy = jest
          .spyOn(incomingPaymentService, 'get')
          .mockResolvedValueOnce(undefined)

        const remoteIncomingPaymentServiceGetSpy = jest
          .spyOn(remoteIncomingPaymentService, 'get')
          .mockResolvedValueOnce(RemoteIncomingPaymentError.InvalidGrant)

        await expect(
          receiverService.get(mockedIncomingPayment.id)
        ).resolves.toBeUndefined()
        expect(localIncomingPaymentServiceGetSpy).toHaveBeenCalledTimes(1)
        expect(remoteIncomingPaymentServiceGetSpy).toHaveBeenCalledTimes(1)
      })

      test('gets receiver from completed remote incoming payment', async () => {
        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
          completed: true
        })

        const localIncomingPaymentServiceGetSpy = jest
          .spyOn(incomingPaymentService, 'get')
          .mockResolvedValueOnce(undefined)

        const remoteIncomingPaymentServiceGetSpy = jest
          .spyOn(remoteIncomingPaymentService, 'get')
          .mockResolvedValueOnce(mockedIncomingPayment)

        await expect(
          receiverService.get(mockedIncomingPayment.id)
        ).resolves.toEqual({
          assetCode: mockedIncomingPayment.receivedAmount.assetCode,
          assetScale: mockedIncomingPayment.receivedAmount.assetScale,
          incomingPayment: {
            id: mockedIncomingPayment.id,
            walletAddress: mockedIncomingPayment.walletAddress,
            incomingAmount: mockedIncomingPayment.incomingAmount
              ? parseAmount(mockedIncomingPayment.incomingAmount)
              : undefined,
            receivedAmount: parseAmount(mockedIncomingPayment.receivedAmount),
            completed: mockedIncomingPayment.completed,
            metadata: mockedIncomingPayment.metadata,
            expiresAt: mockedIncomingPayment.expiresAt
              ? new Date(mockedIncomingPayment.expiresAt)
              : undefined,
            createdAt: new Date(mockedIncomingPayment.createdAt),
            methods: [
              {
                type: 'ilp',
                ilpAddress: expect.any(String),
                sharedSecret: expect.any(String)
              }
            ]
          },
          isLocal: false
        })

        expect(localIncomingPaymentServiceGetSpy).toHaveBeenCalledTimes(1)
        expect(remoteIncomingPaymentServiceGetSpy).toHaveBeenCalledTimes(1)
      })
    })
  })

  describe('create', () => {
    describe('local incoming payment', () => {
      let walletAddress: MockWalletAddress
      const amount: Amount = {
        value: BigInt(123),
        assetCode: 'USD',
        assetScale: 2
      }

      beforeEach(async () => {
        const asset = await createAsset(deps, {
          assetOptions: {
            code: 'USD',
            scale: 2
          }
        })

        walletAddress = await createWalletAddress(deps, {
          tenantId: Config.operatorTenantId,
          mockServerPort: Config.openPaymentsPort,
          assetId: asset.id
        })
      })

      test.each`
        incomingAmount | expiresAt                        | metadata
        ${undefined}   | ${undefined}                     | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${{ description: 'Test incoming payment', externalRef: '#123' }}
      `(
        'creates receiver from local incoming payment ($#)',
        async ({ metadata, expiresAt, incomingAmount }): Promise<void> => {
          const incomingPaymentCreateSpy = jest.spyOn(
            incomingPaymentService,
            'create'
          )
          const remoteIncomingPaymentCreateSpy = jest.spyOn(
            remoteIncomingPaymentService,
            'create'
          )

          jest
            .spyOn(paymentMethodProviderService, 'getPaymentMethods')
            .mockResolvedValueOnce([
              {
                type: 'ilp',
                ilpAddress: 'test.rafiki',
                sharedSecret: 'secret'
              }
            ])

          const receiver = await receiverService.create({
            walletAddressUrl: walletAddress.address,
            incomingAmount,
            expiresAt,
            metadata,
            tenantId
          })

          assert(receiver instanceof Receiver)
          expect(receiver).toEqual({
            assetCode: walletAddress.asset.code,
            assetScale: walletAddress.asset.scale,
            incomingPayment: {
              id: receiver.incomingPayment?.id,
              walletAddress: receiver.incomingPayment?.walletAddress,
              completed: receiver.incomingPayment?.completed,
              receivedAmount: receiver.incomingPayment?.receivedAmount,
              incomingAmount: receiver.incomingPayment?.incomingAmount,
              metadata: receiver.incomingPayment?.metadata || undefined,
              createdAt: receiver.incomingPayment?.createdAt,
              expiresAt: receiver.incomingPayment?.expiresAt,
              methods: receiver.paymentMethods
            },
            isLocal: true
          })

          expect(incomingPaymentCreateSpy).toHaveBeenCalledWith({
            walletAddressId: walletAddress.id,
            incomingAmount,
            expiresAt,
            metadata,
            tenantId: Config.operatorTenantId
          })
          expect(remoteIncomingPaymentCreateSpy).not.toHaveBeenCalled()
        }
      )

      test('returns error if could not create local incoming payment', async (): Promise<void> => {
        jest
          .spyOn(incomingPaymentService, 'create')
          .mockResolvedValueOnce(IncomingPaymentError.InvalidAmount)

        await expect(
          receiverService.create({
            walletAddressUrl: walletAddress.address,
            tenantId
          })
        ).resolves.toEqual(ReceiverError.InvalidAmount)
      })

      test('throws error if could not generate any payment methods', async () => {
        jest
          .spyOn(paymentMethodProviderService, 'getPaymentMethods')
          .mockResolvedValueOnce([])

        await expect(
          receiverService.create({
            walletAddressUrl: walletAddress.address,
            tenantId
          })
        ).rejects.toThrow(
          'Could not get any payment methods during local incoming payment creation'
        )
      })
    })

    describe('remote incoming payment', () => {
      const walletAddress = mockWalletAddress({
        assetCode: 'USD',
        assetScale: 2
      })

      const amount: Amount = {
        value: BigInt(123),
        assetCode: 'USD',
        assetScale: 2
      }

      test.each`
        incomingAmount | expiresAt                        | metadata
        ${undefined}   | ${undefined}                     | ${undefined}
        ${amount}      | ${new Date(Date.now() + 30_000)} | ${{ description: 'Test incoming payment', externalRef: '#123' }}
      `(
        'creates receiver from remote incoming payment ($#)',
        async ({ metadata, expiresAt, incomingAmount }): Promise<void> => {
          jest
            .spyOn(walletAddressService, 'getByUrl')
            .mockResolvedValueOnce(undefined)
          const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
            metadata,
            expiresAt,
            incomingAmount
          })
          const remoteIncomingPaymentServiceSpy = jest
            .spyOn(remoteIncomingPaymentService, 'create')
            .mockResolvedValueOnce(mockedIncomingPayment)

          const localIncomingPaymentCreateSpy = jest.spyOn(
            incomingPaymentService,
            'create'
          )
          const receiver = await receiverService.create({
            walletAddressUrl: walletAddress.id,
            incomingAmount,
            expiresAt,
            metadata,
            tenantId
          })

          expect(receiver).toEqual({
            assetCode: mockedIncomingPayment.receivedAmount.assetCode,
            assetScale: mockedIncomingPayment.receivedAmount.assetScale,
            incomingPayment: {
              id: mockedIncomingPayment.id,
              walletAddress: mockedIncomingPayment.walletAddress,
              incomingAmount: mockedIncomingPayment.incomingAmount
                ? parseAmount(mockedIncomingPayment.incomingAmount)
                : undefined,
              receivedAmount: parseAmount(mockedIncomingPayment.receivedAmount),
              completed: mockedIncomingPayment.completed,
              metadata: mockedIncomingPayment.metadata,
              expiresAt: mockedIncomingPayment.expiresAt
                ? new Date(mockedIncomingPayment.expiresAt)
                : undefined,
              createdAt: new Date(mockedIncomingPayment.createdAt),
              methods: [
                {
                  type: 'ilp',
                  ilpAddress: expect.any(String),
                  sharedSecret: expect.any(String)
                }
              ]
            },
            isLocal: false
          })
          expect(remoteIncomingPaymentServiceSpy).toHaveBeenCalledWith({
            walletAddressUrl: walletAddress.id,
            incomingAmount,
            expiresAt,
            metadata,
            tenantId
          })
          expect(localIncomingPaymentCreateSpy).not.toHaveBeenCalled()
        }
      )

      test('returns error if could not create remote incoming payment', async (): Promise<void> => {
        jest
          .spyOn(remoteIncomingPaymentService, 'create')
          .mockResolvedValueOnce(
            RemoteIncomingPaymentError.UnknownWalletAddress
          )

        await expect(
          receiverService.create({
            walletAddressUrl: walletAddress.id,
            tenantId
          })
        ).resolves.toEqual(ReceiverError.UnknownWalletAddress)
      })

      test('throws if error creating receiver from remote incoming payment', async () => {
        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
          completed: true // cannot get receiver with a completed incoming payment
        })

        jest
          .spyOn(walletAddressService, 'getByUrl')
          .mockResolvedValueOnce(undefined)

        const remoteIncomingPaymentServiceCreateSpy = jest
          .spyOn(remoteIncomingPaymentService, 'create')
          .mockResolvedValueOnce(mockedIncomingPayment)

        await expect(
          receiverService.create({
            walletAddressUrl: mockedIncomingPayment.walletAddress,
            tenantId
          })
        ).rejects.toThrow('Could not create receiver from incoming payment')
        expect(remoteIncomingPaymentServiceCreateSpy).toHaveBeenCalledTimes(1)
      })
    })
  })
})
