import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import assert from 'assert'
import { Grant } from './model'
import { GrantService, ServiceDependencies, getExistingGrant } from './service'
import { AuthServer } from '../authServer/model'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { Config } from '../../config/app'
import { createTestApp, TestContainer } from '../../tests/app'
import { truncateTables } from '../../tests/tableManager'
import {
  AccessType,
  AccessAction,
  AuthenticatedClient,
  mockGrant,
  mockAccessToken,
  mockPendingGrant
} from '@interledger/open-payments'
import { v4 as uuid } from 'uuid'
import { GrantError, isGrantError } from './errors'
import { AuthServerService } from '../authServer/service'

describe('Grant Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grantService: GrantService
  let openPaymentsClient: AuthenticatedClient
  let authServerService: AuthServerService
  let knex: Knex

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    grantService = await deps.use('grantService')
    openPaymentsClient = await deps.use('openPaymentsClient')
    authServerService = await deps.use('authServerService')
    knex = appContainer.knex
  })

  beforeEach(async (): Promise<void> => {
    jest.useFakeTimers()
    jest.setSystemTime(Date.now())
  })

  afterEach(async (): Promise<void> => {
    jest.useRealTimers()
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('getOrCreate', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('gets existing grant', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const openPaymentsGrantRequestSpy = jest.spyOn(
        openPaymentsClient.grant,
        'request'
      )

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.id).toBe(existingGrant.id)
      expect(openPaymentsGrantRequestSpy).not.toHaveBeenCalled()
    })

    test('updates expired grant (by rotating existing token)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.ReadAll,
          AccessAction.Create,
          AccessAction.Complete
        ],
        expiresAt: new Date(Date.now() - 1000)
      })

      const openPaymentsGrantRequestSpy = jest.spyOn(
        openPaymentsClient.grant,
        'request'
      )

      const rotatedAccessToken = mockAccessToken()
      const managementId = uuid()
      rotatedAccessToken.access_token.manage = `${faker.internet.url()}token/${managementId}`

      const openPaymentsTokenRotationSpy = jest
        .spyOn(openPaymentsClient.token, 'rotate')
        .mockResolvedValueOnce(rotatedAccessToken)

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant).toMatchObject({
        id: existingGrant.id,
        authServerId: existingGrant.authServerId,
        accessToken: rotatedAccessToken.access_token.value,
        expiresAt: new Date(
          Date.now() + rotatedAccessToken.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsGrantRequestSpy).not.toHaveBeenCalled()
      expect(openPaymentsTokenRotationSpy).toHaveBeenCalledWith({
        url: existingGrant.getManagementUrl(authServer.url),
        accessToken: existingGrant.accessToken
      })
    })

    test('creates new grant when no prior existing grant', async () => {
      const managementId = uuid()
      const newOpenPaymentsGrant = mockGrant()
      newOpenPaymentsGrant.access_token.manage = `${faker.internet.url()}token/${managementId}`
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce({
          ...newOpenPaymentsGrant
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.Read]
      }

      const authServerServiceGetOrCreateSoy = jest.spyOn(
        authServerService,
        'getOrCreate'
      )

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant).toMatchObject({
        authServerId: authServer.id,
        accessType: options.accessType,
        accessActions: options.accessActions,
        accessToken: newOpenPaymentsGrant.access_token.value,
        expiresAt: new Date(
          Date.now() + newOpenPaymentsGrant.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalledWith(
        { url: options.authServer },
        {
          access_token: {
            access: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: options.accessType as any,
                actions: options.accessActions
              }
            ]
          },
          interact: {
            start: ['redirect']
          }
        }
      )
      expect(authServerServiceGetOrCreateSoy).toHaveBeenCalled()
    })

    test('creates new grant with additional subset actions', async () => {
      const newOpenPaymentsGrant = mockGrant()
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce({
          ...newOpenPaymentsGrant
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Create,
          AccessAction.ReadAll,
          AccessAction.ListAll
        ]
      }

      const authServerServiceGetOrCreateSoy = jest.spyOn(
        authServerService,
        'getOrCreate'
      )

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.accessActions.sort()).toEqual(
        [
          AccessAction.Create,
          AccessAction.ReadAll,
          AccessAction.ListAll,
          AccessAction.List,
          AccessAction.Read
        ].sort()
      )
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalledWith(
        { url: options.authServer },
        {
          access_token: {
            access: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: options.accessType as any,
                actions: options.accessActions
              }
            ]
          },
          interact: {
            start: ['redirect']
          }
        }
      )
      expect(authServerServiceGetOrCreateSoy).toHaveBeenCalled()
    })

    test('creates new grant and deletes old one after being unable to rotate existing token', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Read,
          AccessAction.Create,
          AccessAction.Complete
        ],
        expiresAt: new Date(Date.now() - 1000)
      })

      const managementId = uuid()
      const newOpenPaymentsGrant = mockGrant()
      newOpenPaymentsGrant.access_token.manage = `${faker.internet.url()}token/${managementId}`
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce(newOpenPaymentsGrant)

      const openPaymentsTokenRotationSpy = jest
        .spyOn(openPaymentsClient.token, 'rotate')
        .mockImplementationOnce(() => {
          throw new Error('Could not rotate token')
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.Read]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.id).not.toBe(existingGrant.id)
      expect(grant).toMatchObject({
        accessType: options.accessType,
        accessActions: options.accessActions,
        authServerId: authServer.id,
        accessToken: newOpenPaymentsGrant.access_token.value,
        expiresAt: new Date(
          Date.now() + newOpenPaymentsGrant.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsTokenRotationSpy).toHaveBeenCalled()
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()

      const originalGrant = await Grant.query(knex).findById(existingGrant.id)
      expect(originalGrant?.deletedAt).toBeDefined()
    })

    test('returns error if Open Payments grant request fails', async () => {
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockImplementationOnce(() => {
          throw new Error('Could not request grant')
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const error = await grantService.getOrCreate(options)

      expect(error).toBe(GrantError.InvalidGrantRequest)
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()
    })

    test('returns error if Open Payments grant request returns a pending grant', async () => {
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce(mockPendingGrant())

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const error = await grantService.getOrCreate(options)

      expect(error).toBe(GrantError.GrantRequiresInteraction)
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()
    })
  })

  describe('getExistingGrant', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('gets existing grant (identical match)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toEqual({ ...existingGrant, authServer })
    })

    test('gets existing grant (requested actions are a subset of saved actions)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Complete,
          AccessAction.Create,
          AccessAction.ReadAll
        ]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll, AccessAction.Create]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toEqual({ ...existingGrant, authServer })
    })

    test('ignores deleted grants', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll],
        deletedAt: new Date()
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores different accessType', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.OutgoingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores different auth server url', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores insufficient accessActions', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.id,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll, AccessAction.Create]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })
  })

  describe('delete', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('deletes grant', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const now = new Date()
      jest.setSystemTime(now)

      const grant = await grantService.delete(existingGrant.id)

      expect(grant.id).toBe(existingGrant.id)
      expect(grant.deletedAt).toEqual(now)
    })
  })

  describe('getOrCreate', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('gets existing grant', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const openPaymentsGrantRequestSpy = jest.spyOn(
        openPaymentsClient.grant,
        'request'
      )

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.id).toBe(existingGrant.id)
      expect(openPaymentsGrantRequestSpy).not.toHaveBeenCalled()
    })

    test('updates expired grant (by rotating existing token)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.ReadAll,
          AccessAction.Create,
          AccessAction.Complete
        ],
        expiresAt: new Date(Date.now() - 1000)
      })

      const openPaymentsGrantRequestSpy = jest.spyOn(
        openPaymentsClient.grant,
        'request'
      )

      const rotatedAccessToken = mockAccessToken()
      const managementId = uuid()
      rotatedAccessToken.access_token.manage = `${faker.internet.url()}token/${managementId}`

      const openPaymentsTokenRotationSpy = jest
        .spyOn(openPaymentsClient.token, 'rotate')
        .mockResolvedValueOnce(rotatedAccessToken)

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant).toMatchObject({
        id: existingGrant.id,
        authServerId: existingGrant.authServerId,
        accessToken: rotatedAccessToken.access_token.value,
        expiresAt: new Date(
          Date.now() + rotatedAccessToken.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsGrantRequestSpy).not.toHaveBeenCalled()
      expect(openPaymentsTokenRotationSpy).toHaveBeenCalledWith({
        url: existingGrant.getManagementUrl(authServer.url),
        accessToken: existingGrant.accessToken
      })
    })

    test('creates new grant when no prior existing grant', async () => {
      const managementId = uuid()
      const newOpenPaymentsGrant = mockGrant()
      newOpenPaymentsGrant.access_token.manage = `${faker.internet.url()}token/${managementId}`
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce({
          ...newOpenPaymentsGrant
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.Read]
      }

      const authServerServiceGetOrCreateSoy = jest.spyOn(
        authServerService,
        'getOrCreate'
      )

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant).toMatchObject({
        authServerId: authServer.id,
        accessType: options.accessType,
        accessActions: options.accessActions,
        accessToken: newOpenPaymentsGrant.access_token.value,
        expiresAt: new Date(
          Date.now() + newOpenPaymentsGrant.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalledWith(
        { url: options.authServer },
        {
          access_token: {
            access: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: options.accessType as any,
                actions: options.accessActions
              }
            ]
          },
          interact: {
            start: ['redirect']
          }
        }
      )
      expect(authServerServiceGetOrCreateSoy).toHaveBeenCalled()
    })

    test('creates new grant with additional subset actions', async () => {
      const newOpenPaymentsGrant = mockGrant()
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce({
          ...newOpenPaymentsGrant
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Create,
          AccessAction.ReadAll,
          AccessAction.ListAll
        ]
      }

      const authServerServiceGetOrCreateSoy = jest.spyOn(
        authServerService,
        'getOrCreate'
      )

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.accessActions.sort()).toEqual(
        [
          AccessAction.Create,
          AccessAction.ReadAll,
          AccessAction.ListAll,
          AccessAction.List,
          AccessAction.Read
        ].sort()
      )
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalledWith(
        { url: options.authServer },
        {
          access_token: {
            access: [
              {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                type: options.accessType as any,
                actions: options.accessActions
              }
            ]
          },
          interact: {
            start: ['redirect']
          }
        }
      )
      expect(authServerServiceGetOrCreateSoy).toHaveBeenCalled()
    })

    test('creates new grant and deletes old one after being unable to rotate existing token', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Read,
          AccessAction.Create,
          AccessAction.Complete
        ],
        expiresAt: new Date(Date.now() - 1000)
      })

      const managementId = uuid()
      const newOpenPaymentsGrant = mockGrant()
      newOpenPaymentsGrant.access_token.manage = `${faker.internet.url()}token/${managementId}`
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce(newOpenPaymentsGrant)

      const openPaymentsTokenRotationSpy = jest
        .spyOn(openPaymentsClient.token, 'rotate')
        .mockImplementationOnce(() => {
          throw new Error('Could not rotate token')
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.Read]
      }

      const grant = await grantService.getOrCreate(options)

      assert(!isGrantError(grant))
      expect(grant.id).not.toBe(existingGrant.id)
      expect(grant).toMatchObject({
        accessType: options.accessType,
        accessActions: options.accessActions,
        authServerId: authServer.id,
        accessToken: newOpenPaymentsGrant.access_token.value,
        expiresAt: new Date(
          Date.now() + newOpenPaymentsGrant.access_token.expires_in! * 1000
        ),
        managementId
      })
      expect(openPaymentsTokenRotationSpy).toHaveBeenCalled()
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()

      const originalGrant = await Grant.query(knex).findById(existingGrant.id)
      expect(originalGrant?.deletedAt).toBeDefined()
    })

    test('returns error if Open Payments grant request fails', async () => {
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockImplementationOnce(() => {
          throw new Error('Could not request grant')
        })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const error = await grantService.getOrCreate(options)

      expect(error).toBe(GrantError.InvalidGrantRequest)
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()
    })

    test('returns error if Open Payments grant request returns a pending grant', async () => {
      const openPaymentsGrantRequestSpy = jest
        .spyOn(openPaymentsClient.grant, 'request')
        .mockResolvedValueOnce(mockPendingGrant())

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.Create, AccessAction.ReadAll]
      }

      const error = await grantService.getOrCreate(options)

      expect(error).toBe(GrantError.GrantRequiresInteraction)
      expect(openPaymentsGrantRequestSpy).toHaveBeenCalled()
    })
  })

  describe('getExistingGrant', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('gets existing grant (identical match)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toEqual({ ...existingGrant, authServer })
    })

    test('gets existing grant (requested actions are a subset of saved actions)', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [
          AccessAction.Complete,
          AccessAction.Create,
          AccessAction.ReadAll
        ]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll, AccessAction.Create]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toEqual({ ...existingGrant, authServer })
    })

    test('ignores deleted grants', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll],
        deletedAt: new Date()
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores different accessType', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.url,
        accessType: AccessType.OutgoingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores different auth server url', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })

    test('ignores insufficient accessActions', async () => {
      await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const options = {
        authServer: authServer.id,
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll, AccessAction.Create]
      }

      await expect(
        getExistingGrant({ knex } as ServiceDependencies, options)
      ).resolves.toBeUndefined()
    })
  })

  describe('delete', (): void => {
    let authServer: AuthServer

    beforeEach(async (): Promise<void> => {
      const authServerService = await deps.use('authServerService')
      const url = faker.internet.url({ appendSlash: false })
      authServer = await authServerService.getOrCreate(url)
    })

    test('deletes grant', async () => {
      const existingGrant = await Grant.query(knex).insertAndFetch({
        authServerId: authServer.id,
        accessToken: uuid(),
        managementId: uuid(),
        accessType: AccessType.IncomingPayment,
        accessActions: [AccessAction.ReadAll]
      })

      const now = new Date()
      jest.setSystemTime(now)

      const grant = await grantService.delete(existingGrant.id)

      expect(grant.id).toBe(existingGrant.id)
      expect(grant.deletedAt).toEqual(now)
    })
  })
})
