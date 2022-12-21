import { IocContract } from '@adonisjs/fold'
import { faker } from '@faker-js/faker'
import { Knex } from 'knex'
import {
  AuthenticatedClient,
  GrantRequest,
  NonInteractiveGrant
} from 'open-payments'
import { URL } from 'url'
import { v4 as uuid } from 'uuid'

import { ReceiverService } from './service'
import { createTestApp, TestContainer } from '../../tests/app'
import { Config } from '../../config/app'
import { initIocContainer } from '../..'
import { AppServices } from '../../app'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'
import { ConnectionService } from '../connection/service'
import { AccessAction, AccessType } from '../grant/model'
import { GrantService } from '../grant/service'
import { IncomingPayment } from '../payment/incoming/model'
import { PaymentPointer } from '../payment_pointer/model'
import { PaymentPointerService } from '../payment_pointer/service'

describe('Receiver Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let receiverService: ReceiverService
  let openPaymentsClient: AuthenticatedClient
  let knex: Knex
  let connectionService: ConnectionService
  let paymentPointerService: PaymentPointerService
  let grantService: GrantService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    receiverService = await deps.use('receiverService')
    openPaymentsClient = await deps.use('openPaymentsClient')
    connectionService = await deps.use('connectionService')
    paymentPointerService = await deps.use('paymentPointerService')
    grantService = await deps.use('grantService')
    knex = await deps.use('knex')
  })

  afterEach(async (): Promise<void> => {
    jest.restoreAllMocks()
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', () => {
    describe('connections', () => {
      const CONNECTION_PATH = 'connections'

      test('resolves local connection', async () => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: Config.openPaymentsPort
        })
        const { connectionId } = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const localUrl = `${Config.openPaymentsUrl}/${CONNECTION_PATH}/${connectionId}`

        const clientGetConnectionSpy = jest.spyOn(
          openPaymentsClient.ilpStreamConnection,
          'get'
        )

        await expect(receiverService.get(localUrl)).resolves.toEqual({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: undefined,
          receivedAmount: undefined,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer),
          expiresAt: undefined
        })
        expect(clientGetConnectionSpy).not.toHaveBeenCalled()
      })

      test('resolves remote connection', async () => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const remoteUrl = new URL(
          `${paymentPointer.url}/${CONNECTION_PATH}/${incomingPayment.connectionId}`
        )

        const clientGetConnectionSpy = jest
          .spyOn(openPaymentsClient.ilpStreamConnection, 'get')
          .mockImplementationOnce(async () =>
            connectionService.get(incomingPayment).toOpenPaymentsType()
          )

        await expect(receiverService.get(remoteUrl.href)).resolves.toEqual({
          assetCode: paymentPointer.asset.code,
          assetScale: paymentPointer.asset.scale,
          incomingAmount: undefined,
          receivedAmount: undefined,
          ilpAddress: expect.any(String),
          sharedSecret: expect.any(Buffer),
          expiresAt: undefined
        })
        expect(clientGetConnectionSpy).toHaveBeenCalledWith({
          url: remoteUrl.href
        })
      })

      test('returns undefined for unknown local connection', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)

        await expect(
          receiverService.get(
            `${paymentPointer.url}/${CONNECTION_PATH}/${uuid()}`
          )
        ).resolves.toBeUndefined()
      })

      test('returns undefined for unknown remote connection', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })
        const remoteUrl = new URL(
          `${paymentPointer.url}/${CONNECTION_PATH}/${incomingPayment.connectionId}`
        )

        const clientGetConnectionSpy = jest
          .spyOn(openPaymentsClient.ilpStreamConnection, 'get')
          .mockResolvedValueOnce(undefined)

        await expect(
          receiverService.get(remoteUrl.href)
        ).resolves.toBeUndefined()
        expect(clientGetConnectionSpy).toHaveBeenCalledWith({
          url: remoteUrl.href
        })
      })

      test('returns undefined when fetching remote connection throws', async (): Promise<void> => {
        const paymentPointer = await createPaymentPointer(deps)
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id
        })

        const remoteUrl = new URL(
          `${paymentPointer.url}/${CONNECTION_PATH}/${incomingPayment.connectionId}`
        )

        const clientGetConnectionSpy = jest
          .spyOn(openPaymentsClient.ilpStreamConnection, 'get')
          .mockImplementationOnce(async () => {
            throw new Error('Could not get connection')
          })

        await expect(
          receiverService.get(remoteUrl.href)
        ).resolves.toBeUndefined()
        expect(clientGetConnectionSpy).toHaveBeenCalledWith({
          url: remoteUrl.href
        })
      })
    })

    describe('incoming payments', () => {
      test('resolves local incoming payment', async () => {
        const paymentPointer = await createPaymentPointer(deps, {
          mockServerPort: Config.openPaymentsPort
        })
        const incomingPayment = await createIncomingPayment(deps, {
          paymentPointerId: paymentPointer.id,
          incomingAmount: {
            value: BigInt(5),
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale
          }
        })

        const clientGetIncomingPaymentSpy = jest.spyOn(
          openPaymentsClient.ilpStreamConnection,
          'get'
        )

        await expect(receiverService.get(incomingPayment.url)).resolves.toEqual(
          {
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale,
            incomingAmountValue: incomingPayment.incomingAmount.value,
            receivedAmountValue: incomingPayment.receivedAmount.value,
            ilpAddress: expect.any(String),
            sharedSecret: expect.any(Buffer),
            expiresAt: expect.any(Date)
          }
        )
        expect(clientGetIncomingPaymentSpy).not.toHaveBeenCalled()
      })

      describe.each`
        existingGrant | description
        ${false}      | ${'no grant'}
        ${true}       | ${'existing grant'}
      `('remote ($description)', ({ existingGrant }): void => {
        let paymentPointer: PaymentPointer
        let incomingPayment: IncomingPayment
        const authServer = faker.internet.url()
        const INCOMING_PAYMENT_PATH = 'incoming-payments'
        const grantOptions = {
          accessType: AccessType.IncomingPayment,
          accessActions: [AccessAction.ReadAll],
          accessToken: 'OZB8CDFONP219RP1LT0OS9M2PMHKUR64TB8N6BW7'
        }
        const grantRequest: GrantRequest = {
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
        } as GrantRequest
        const grant: NonInteractiveGrant = {
          access_token: {
            value: grantOptions.accessToken,
            manage: `${authServer}/token/8f69de01-5bf9-4603-91ed-eeca101081f1`,
            expires_in: 3600,
            access: grantRequest.access_token.access
          },
          continue: {
            access_token: {
              value: '33OMUKMKSKU80UPRY5NM'
            },
            uri: `${authServer}/continue/4CF492MLVMSW9MKMXKHQ`,
            wait: 30
          }
        }

        beforeEach(async (): Promise<void> => {
          paymentPointer = await createPaymentPointer(deps)
          incomingPayment = await createIncomingPayment(deps, {
            paymentPointerId: paymentPointer.id,
            incomingAmount: {
              value: BigInt(5),
              assetCode: paymentPointer.asset.code,
              assetScale: paymentPointer.asset.scale
            }
          })
          if (existingGrant) {
            await expect(
              grantService.create({
                ...grantOptions,
                authServer
              })
            ).resolves.toMatchObject(grantOptions)
          }
          jest
            .spyOn(paymentPointerService, 'getByUrl')
            .mockResolvedValueOnce(undefined)
        })

        test('resolves incoming payment', async () => {
          const clientGetPaymentPointerSpy = jest
            .spyOn(openPaymentsClient.paymentPointer, 'get')
            .mockResolvedValueOnce(
              paymentPointer.toOpenPaymentsType({
                authServer
              })
            )

          const clientRequestGrantSpy = jest
            .spyOn(openPaymentsClient.grant, 'request')
            .mockResolvedValueOnce(grant)

          const clientGetIncomingPaymentSpy = jest
            .spyOn(openPaymentsClient.incomingPayment, 'get')
            .mockResolvedValueOnce(
              incomingPayment.toOpenPaymentsType({
                ilpStreamConnection: connectionService.get(incomingPayment)
              })
            )

          await expect(
            receiverService.get(incomingPayment.url)
          ).resolves.toEqual({
            assetCode: paymentPointer.asset.code,
            assetScale: paymentPointer.asset.scale,
            incomingAmountValue: incomingPayment.incomingAmount.value,
            receivedAmountValue: incomingPayment.receivedAmount.value,
            ilpAddress: expect.any(String),
            sharedSecret: expect.any(Buffer),
            expiresAt: expect.any(Date)
          })
          expect(clientGetPaymentPointerSpy).toHaveBeenCalledWith({
            url: paymentPointer.url
          })
          if (!existingGrant) {
            expect(clientRequestGrantSpy).toHaveBeenCalledWith(
              { url: authServer },
              grantRequest
            )
          }
          expect(clientGetIncomingPaymentSpy).toHaveBeenCalledWith({
            url: incomingPayment.url,
            accessToken: grantOptions.accessToken
          })
        })

        test('returns undefined for invalid remote incoming payment payment pointer', async (): Promise<void> => {
          const clientGetPaymentPointerSpy = jest
            .spyOn(openPaymentsClient.paymentPointer, 'get')
            .mockRejectedValueOnce(new Error('Could not get payment pointer'))

          await expect(
            receiverService.get(
              `${paymentPointer.url}/${INCOMING_PAYMENT_PATH}/${uuid()}`
            )
          ).resolves.toBeUndefined()
          expect(clientGetPaymentPointerSpy).toHaveBeenCalledWith({
            url: paymentPointer.url
          })
        })

        if (existingGrant) {
          test('returns undefined for expired grant', async (): Promise<void> => {
            const grant = await grantService.get({
              ...grantOptions,
              authServer
            })
            await grant.$query(knex).patch({ expiresAt: new Date() })
            jest
              .spyOn(openPaymentsClient.paymentPointer, 'get')
              .mockResolvedValueOnce(
                paymentPointer.toOpenPaymentsType({
                  authServer
                })
              )
            const clientRequestGrantSpy = jest.spyOn(
              openPaymentsClient.grant,
              'request'
            )

            await expect(
              receiverService.get(incomingPayment.url)
            ).resolves.toBeUndefined()
            expect(clientRequestGrantSpy).not.toHaveBeenCalled()
          })
        } else {
          test('returns undefined for invalid grant', async (): Promise<void> => {
            jest
              .spyOn(openPaymentsClient.paymentPointer, 'get')
              .mockResolvedValueOnce(
                paymentPointer.toOpenPaymentsType({
                  authServer
                })
              )
            const clientRequestGrantSpy = jest
              .spyOn(openPaymentsClient.grant, 'request')
              .mockRejectedValueOnce(new Error('Could not request grant'))

            await expect(
              receiverService.get(incomingPayment.url)
            ).resolves.toBeUndefined()
            expect(clientRequestGrantSpy).toHaveBeenCalledWith(
              { url: authServer },
              grantRequest
            )
          })

          test('returns undefined for interactive grant', async (): Promise<void> => {
            jest
              .spyOn(openPaymentsClient.paymentPointer, 'get')
              .mockResolvedValueOnce(
                paymentPointer.toOpenPaymentsType({
                  authServer
                })
              )
            const clientRequestGrantSpy = jest
              .spyOn(openPaymentsClient.grant, 'request')
              .mockResolvedValueOnce({
                continue: grant.continue,
                interact: {
                  redirect: `${authServer}/4CF492MLVMSW9MKMXKHQ`,
                  finish: 'MBDOFXG4Y5CVJCX821LH'
                }
              })

            await expect(
              receiverService.get(incomingPayment.url)
            ).resolves.toBeUndefined()
            expect(clientRequestGrantSpy).toHaveBeenCalledWith(
              { url: authServer },
              grantRequest
            )
          })
        }

        test('returns undefined when fetching remote incoming payment throws', async (): Promise<void> => {
          jest
            .spyOn(openPaymentsClient.paymentPointer, 'get')
            .mockResolvedValueOnce(
              paymentPointer.toOpenPaymentsType({
                authServer
              })
            )
          jest
            .spyOn(openPaymentsClient.grant, 'request')
            .mockResolvedValueOnce(grant)
          const clientGetIncomingPaymentSpy = jest
            .spyOn(openPaymentsClient.incomingPayment, 'get')
            .mockRejectedValueOnce(new Error('Could not get incoming payment'))

          await expect(
            receiverService.get(incomingPayment.url)
          ).resolves.toBeUndefined()
          expect(clientGetIncomingPaymentSpy).toHaveBeenCalledWith({
            url: incomingPayment.url,
            accessToken: expect.any(String)
          })
        })
      })
    })
  })
})
