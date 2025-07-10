import { v4 as uuid } from 'uuid'
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
  mockWalletAddress,
  mockIncomingPaymentWithPaymentMethods,
  OpenPaymentsClientError,
  mockPublicIncomingPayment
} from '@interledger/open-payments'
import { GrantService } from '../../grant/service'
import { RemoteIncomingPaymentError } from './errors'
import { Grant } from '../../grant/model'
import { GrantError } from '../../grant/errors'

describe('Remote Incoming Payment Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let remoteIncomingPaymentService: RemoteIncomingPaymentService
  let openPaymentsClient: OpenPaymentsClient
  let grantService: GrantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    openPaymentsClient = await deps.use('openPaymentsClient')
    grantService = await deps.use('grantService')
    remoteIncomingPaymentService = await deps.use(
      'remoteIncomingPaymentService'
    )
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    const walletAddress = mockWalletAddress({
      id: 'https://example.com/mocked',
      resourceServer: 'https://example.com/'
    })

    beforeEach(() => {
      jest
        .spyOn(openPaymentsClient.walletAddress, 'get')
        .mockResolvedValue(walletAddress)
    })

    test('throws if wallet address not found', async () => {
      const clientGetWalletAddressSpy = jest
        .spyOn(openPaymentsClient.walletAddress, 'get')
        .mockImplementationOnce(() => {
          throw new Error('No wallet address')
        })

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.UnknownWalletAddress)
      expect(clientGetWalletAddressSpy).toHaveBeenCalledWith({
        url: walletAddress.id
      })
    })

    const incomingAmount: Amount = {
      value: BigInt(123),
      assetCode: 'USD',
      assetScale: 2
    }

    test.each`
      incomingAmount    | expiresAt                        | metadata
      ${undefined}      | ${undefined}                     | ${undefined}
      ${incomingAmount} | ${new Date(Date.now() + 30_000)} | ${{ description: 'Test incoming payment', externalRef: '#123' }}
    `('creates remote incoming payment ($#)', async (args): Promise<void> => {
      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        ...args,
        walletAddress: walletAddress.id
      })

      const clientCreateIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'create')
        .mockResolvedValueOnce(mockedIncomingPayment)

      const accessToken = uuid()
      const grantGetOrCreateSpy = jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce({
          accessToken
        } as Grant)

      const incomingPayment = await remoteIncomingPaymentService.create({
        ...args,
        walletAddressUrl: walletAddress.id
      })

      expect(incomingPayment).toStrictEqual(mockedIncomingPayment)
      expect(grantGetOrCreateSpy).toHaveBeenCalledWith({
        authServer: walletAddress.authServer,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      })
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledWith(
        {
          url: walletAddress.resourceServer,
          accessToken
        },
        {
          ...args,
          walletAddress: walletAddress.id,
          expiresAt: args.expiresAt ? args.expiresAt.toISOString() : undefined,
          incomingAmount: args.incomingAmount
            ? serializeAmount(args.incomingAmount)
            : undefined
        }
      )
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error if invalid grant', async () => {
      jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce(GrantError.InvalidGrantRequest)

      const clientCreateIncomingPaymentSpy = jest.spyOn(
        openPaymentsClient.incomingPayment,
        'create'
      )

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidGrant)
      expect(clientCreateIncomingPaymentSpy).not.toHaveBeenCalled()
    })

    test('returns error without retrying if not OpenPaymentsClientError', async () => {
      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const clientCreateIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'create')
        .mockImplementationOnce(() => {
          throw new Error('unexpected')
        })

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error without retrying if non-auth related OpenPaymentsClientError', async () => {
      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const clientCreateIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'create')
        .mockImplementationOnce(() => {
          throw new OpenPaymentsClientError('unexpected error', {
            description: 'unexpected error'
          })
        })

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error without retrying if non-auth related OpenPaymentsClientError', async () => {
      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const clientCreateIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'create')
        .mockImplementationOnce(() => {
          throw new OpenPaymentsClientError('unexpected error', {
            description: 'unexpected error'
          })
        })

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error after retrying auth related OpenPaymentsClientError', async () => {
      const mockedGrant1 = {
        id: uuid(),
        accessToken: uuid()
      } as Grant
      const mockedGrant2 = {
        id: uuid(),
        accessToken: uuid()
      } as Grant

      const grantGetOrCreateSpy = jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce(mockedGrant1)
        .mockResolvedValueOnce(mockedGrant2)

      const grantDeleteSpy = jest
        .spyOn(grantService, 'delete')
        .mockResolvedValueOnce(mockedGrant1)

      const failedOpenPaymentsClientRequest = () => {
        throw new OpenPaymentsClientError('Invalid token', {
          status: 401,
          description: 'Invalid token'
        })
      }

      const clientCreateIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'create')
        .mockImplementationOnce(failedOpenPaymentsClientRequest)
        .mockImplementationOnce(failedOpenPaymentsClientRequest)

      await expect(
        remoteIncomingPaymentService.create({
          walletAddressUrl: walletAddress.id
        })
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(2)
      expect(grantGetOrCreateSpy).toHaveBeenCalledTimes(2)
      expect(grantDeleteSpy).toHaveBeenCalledTimes(1)
      expect(grantDeleteSpy).toHaveBeenCalledWith(mockedGrant1.id)
    })

    test.each([401, 403])(
      'creates incoming payment after retrying %s OpenPaymentsClientError',
      async (status: number) => {
        const mockedGrant1 = {
          id: uuid(),
          accessToken: uuid()
        } as Grant
        const mockedGrant2 = {
          id: uuid(),
          accessToken: uuid()
        } as Grant

        const grantGetOrCreateSpy = jest
          .spyOn(grantService, 'getOrCreate')
          .mockResolvedValueOnce(mockedGrant1)
          .mockResolvedValueOnce(mockedGrant2)

        const grantDeleteSpy = jest
          .spyOn(grantService, 'delete')
          .mockResolvedValueOnce(mockedGrant1)

        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
          walletAddress: walletAddress.id
        })

        const clientCreateIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'create')
          .mockImplementationOnce(() => {
            throw new OpenPaymentsClientError('Invalid token', {
              status,
              description: 'Invalid token'
            })
          })
          .mockResolvedValueOnce(mockedIncomingPayment)

        await expect(
          remoteIncomingPaymentService.create({
            walletAddressUrl: walletAddress.id
          })
        ).resolves.toStrictEqual(mockedIncomingPayment)
        expect(clientCreateIncomingPaymentSpy).toHaveBeenCalledTimes(2)
        expect(grantGetOrCreateSpy).toHaveBeenCalledTimes(2)
        expect(grantDeleteSpy).toHaveBeenCalledTimes(1)
        expect(grantDeleteSpy).toHaveBeenCalledWith(mockedGrant1.id)
      }
    )
  })

  describe('get', (): void => {
    const walletAddress = mockWalletAddress({
      id: 'https://example.com/mocked',
      resourceServer: 'https://example.com/'
    })

    const publicIncomingPayment = mockPublicIncomingPayment({
      authServer: 'https://auth.example.com/'
    })

    beforeEach(() => {
      jest
        .spyOn(openPaymentsClient.incomingPayment, 'getPublic')
        .mockResolvedValue(publicIncomingPayment)
    })

    test('returns NotFound error if 404 error getting public incoming payment', async () => {
      const clientGetPublicIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'getPublic')
        .mockImplementationOnce(() => {
          throw new OpenPaymentsClientError(
            'Could not find public incoming payment',
            {
              status: 404,
              description: 'Could not find public incoming payment'
            }
          )
        })

      const incomingPaymentUrl = `https://example.com/incoming-payment/${uuid()}`

      await expect(
        remoteIncomingPaymentService.get(incomingPaymentUrl)
      ).resolves.toEqual(RemoteIncomingPaymentError.NotFound)
      expect(clientGetPublicIncomingPaymentSpy).toHaveBeenCalledWith({
        url: incomingPaymentUrl
      })
    })

    test('returns InvalidRequest error if unhandled error getting public incoming payment', async () => {
      const clientGetPublicIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'getPublic')
        .mockImplementationOnce(() => {
          throw new Error('No public incoming payment')
        })

      const incomingPaymentUrl = `https://example.com/incoming-payment/${uuid()}`

      await expect(
        remoteIncomingPaymentService.get(incomingPaymentUrl)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientGetPublicIncomingPaymentSpy).toHaveBeenCalledWith({
        url: incomingPaymentUrl
      })
    })

    test('gets incoming payment', async (): Promise<void> => {
      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      const clientGetIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'get')
        .mockResolvedValueOnce(mockedIncomingPayment)

      const accessToken = uuid()
      const grantGetOrCreateSpy = jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce({
          accessToken
        } as Grant)

      const incomingPayment = await remoteIncomingPaymentService.get(
        mockedIncomingPayment.id
      )

      expect(incomingPayment).toStrictEqual(mockedIncomingPayment)
      expect(grantGetOrCreateSpy).toHaveBeenCalledWith({
        authServer: publicIncomingPayment.authServer,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledWith({
        url: mockedIncomingPayment.id,
        accessToken
      })
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error if invalid grant', async () => {
      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce(GrantError.InvalidGrantRequest)

      const clientGetIncomingPaymentSpy = jest.spyOn(
        openPaymentsClient.incomingPayment,
        'get'
      )

      await expect(
        remoteIncomingPaymentService.get(mockedIncomingPayment.id)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidGrant)
      expect(clientGetIncomingPaymentSpy).not.toHaveBeenCalled()
    })

    test('returns error without retrying if not OpenPaymentsClientError', async () => {
      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const clientGetIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'get')
        .mockImplementationOnce(() => {
          throw new Error('unexpected')
        })

      await expect(
        remoteIncomingPaymentService.get(mockedIncomingPayment.id)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error without retrying if non-auth related OpenPaymentsClientError', async () => {
      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const clientGetIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'get')
        .mockImplementationOnce(() => {
          throw new OpenPaymentsClientError('unexpected error', {
            description: 'unexpected error'
          })
        })

      await expect(
        remoteIncomingPaymentService.get(mockedIncomingPayment.id)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error without retrying if non-auth related OpenPaymentsClientError', async () => {
      jest.spyOn(grantService, 'getOrCreate').mockResolvedValueOnce({
        accessToken: uuid()
      } as Grant)

      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      const clientGetIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'get')
        .mockImplementationOnce(() => {
          throw new OpenPaymentsClientError('unexpected error', {
            description: 'unexpected error'
          })
        })

      await expect(
        remoteIncomingPaymentService.get(mockedIncomingPayment.id)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(1)
    })

    test('returns error after retrying auth related OpenPaymentsClientError', async () => {
      const mockedGrant1 = {
        id: uuid(),
        accessToken: uuid()
      } as Grant
      const mockedGrant2 = {
        id: uuid(),
        accessToken: uuid()
      } as Grant

      const grantGetOrCreateSpy = jest
        .spyOn(grantService, 'getOrCreate')
        .mockResolvedValueOnce(mockedGrant1)
        .mockResolvedValueOnce(mockedGrant2)

      const grantDeleteSpy = jest
        .spyOn(grantService, 'delete')
        .mockResolvedValueOnce(mockedGrant1)

      const failedOpenPaymentsClientRequest = () => {
        throw new OpenPaymentsClientError('Invalid token', {
          status: 401,
          description: 'Invalid token'
        })
      }

      const clientGetIncomingPaymentSpy = jest
        .spyOn(openPaymentsClient.incomingPayment, 'get')
        .mockImplementationOnce(failedOpenPaymentsClientRequest)
        .mockImplementationOnce(failedOpenPaymentsClientRequest)

      const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
        walletAddress: walletAddress.id
      })

      await expect(
        remoteIncomingPaymentService.get(mockedIncomingPayment.id)
      ).resolves.toEqual(RemoteIncomingPaymentError.InvalidRequest)
      expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(2)
      expect(grantGetOrCreateSpy).toHaveBeenCalledTimes(2)
      expect(grantDeleteSpy).toHaveBeenCalledTimes(1)
      expect(grantDeleteSpy).toHaveBeenCalledWith(mockedGrant1.id)
    })

    test.each([401, 403])(
      'gets incoming payment after retrying %s OpenPaymentsClientError',
      async (status: number) => {
        const mockedGrant1 = {
          id: uuid(),
          accessToken: uuid()
        } as Grant
        const mockedGrant2 = {
          id: uuid(),
          accessToken: uuid()
        } as Grant

        const grantGetOrCreateSpy = jest
          .spyOn(grantService, 'getOrCreate')
          .mockResolvedValueOnce(mockedGrant1)
          .mockResolvedValueOnce(mockedGrant2)

        const grantDeleteSpy = jest
          .spyOn(grantService, 'delete')
          .mockResolvedValueOnce(mockedGrant1)

        const mockedIncomingPayment = mockIncomingPaymentWithPaymentMethods({
          walletAddress: walletAddress.id
        })

        const clientGetIncomingPaymentSpy = jest
          .spyOn(openPaymentsClient.incomingPayment, 'get')
          .mockImplementationOnce(() => {
            throw new OpenPaymentsClientError('Invalid token', {
              status,
              description: 'Invalid token'
            })
          })
          .mockResolvedValueOnce(mockedIncomingPayment)

        await expect(
          remoteIncomingPaymentService.get(mockedIncomingPayment.id)
        ).resolves.toStrictEqual(mockedIncomingPayment)
        expect(clientGetIncomingPaymentSpy).toHaveBeenCalledTimes(2)
        expect(grantGetOrCreateSpy).toHaveBeenCalledTimes(2)
        expect(grantDeleteSpy).toHaveBeenCalledTimes(1)
        expect(grantDeleteSpy).toHaveBeenCalledWith(mockedGrant1.id)
      }
    )
  })
})
