import assert from 'assert'
import { gql } from '@apollo/client'
import { Knex } from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { Asset } from '../../asset/model'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  WalletAddressError,
  errorToCode,
  errorToMessage
} from '../../open_payments/wallet_address/errors'
import {
  WalletAddress as WalletAddressModel,
  WalletAddressEvent,
  WalletAddressEventType
} from '../../open_payments/wallet_address/model'
import { WalletAddressService } from '../../open_payments/wallet_address/service'
import { createAsset } from '../../tests/asset'
import { createWalletAddress } from '../../tests/walletAddress'
import {
  CreateWalletAddressInput,
  CreateWalletAddressMutationResponse,
  TriggerWalletAddressEventsMutationResponse,
  WalletAddress,
  WalletAddressStatus,
  UpdateWalletAddressMutationResponse,
  WalletAddressesConnection
} from '../generated/graphql'
import { getPageTests } from './page.test'
import { WalletAddressAdditionalProperty } from '../../open_payments/wallet_address/additional_property/model'

describe('Wallet Address Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let walletAddressService: WalletAddressService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    knex = appContainer.knex
    walletAddressService = await deps.use('walletAddressService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Wallet Address', (): void => {
    let asset: Asset
    let input: CreateWalletAddressInput

    beforeEach(async (): Promise<void> => {
      asset = await createAsset(deps)
      input = {
        assetId: asset.id,
        url: 'https://alice.me/.well-known/pay'
      }
    })

    test.each`
      publicName
      ${'Alice'}
      ${undefined}
    `(
      'Can create a wallet address (publicName: $publicName)',
      async ({ publicName }): Promise<void> => {
        input.publicName = publicName
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
                createWalletAddress(input: $input) {
                  code
                  success
                  message
                  walletAddress {
                    id
                    asset {
                      code
                      scale
                    }
                    url
                    publicName
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): CreateWalletAddressMutationResponse => {
            if (query.data) {
              return query.data.createWalletAddress
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        assert.ok(response.walletAddress)
        expect(response.walletAddress).toEqual({
          __typename: 'WalletAddress',
          id: response.walletAddress.id,
          url: input.url,
          asset: {
            __typename: 'Asset',
            code: asset.code,
            scale: asset.scale
          },
          publicName: publicName ?? null
        })
        await expect(
          walletAddressService.get(response.walletAddress.id)
        ).resolves.toMatchObject({
          id: response.walletAddress.id,
          asset
        })
      }
    )

    test('Can create a wallet address with additional properties', async (): Promise<void> => {
      input.publicName = 'Bob'
      input.additionalProperties = [
        { key: '', value: '', visibleInOpenPayments: false },
        { key: 'key', value: '', visibleInOpenPayments: false },
        { key: '', value: 'val', visibleInOpenPayments: false },
        { key: 'key', value: 'val', visibleInOpenPayments: false },
        { key: 'key-public', value: 'val', visibleInOpenPayments: true }
      ]
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
              createWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                  asset {
                    code
                    scale
                  }
                  url
                  publicName
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.createWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      assert.ok(response.walletAddress)
      expect(response.walletAddress).toEqual({
        __typename: 'WalletAddress',
        id: response.walletAddress.id,
        url: input.url,
        asset: {
          __typename: 'Asset',
          code: asset.code,
          scale: asset.scale
        },
        publicName: input.publicName
      })
      await expect(
        walletAddressService.get(response.walletAddress.id)
      ).resolves.toMatchObject({
        id: response.walletAddress.id,
        asset
      })
    })

    test.each`
      error
      ${WalletAddressError.InvalidUrl}
      ${WalletAddressError.UnknownAsset}
    `('4XX - $error', async ({ error }): Promise<void> => {
      jest.spyOn(walletAddressService, 'create').mockResolvedValueOnce(error)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
              createWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                  asset {
                    code
                    scale
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.createWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual(
        errorToCode[error as WalletAddressError].toString()
      )
      expect(response.message).toEqual(
        errorToMessage[error as WalletAddressError]
      )
    })

    test('500', async (): Promise<void> => {
      jest
        .spyOn(walletAddressService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWalletAddress($input: CreateWalletAddressInput!) {
              createWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                  asset {
                    code
                    scale
                  }
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.createWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create wallet address')
    })
  })

  describe('Update Wallet Address', (): void => {
    let walletAddress: WalletAddressModel

    beforeEach(async (): Promise<void> => {
      walletAddress = await createWalletAddress(deps)
    })

    test('Can update a wallet address', async (): Promise<void> => {
      const updateOptions = {
        id: walletAddress.id,
        status: WalletAddressStatus.Inactive,
        publicName: 'Public Wallet Address'
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
              updateWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                  status
                  publicName
                  additionalProperties {
                    key
                    value
                    visibleInOpenPayments
                  }
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then((query): UpdateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.updateWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.walletAddress).toEqual({
        __typename: 'WalletAddress',
        ...updateOptions,
        additionalProperties: []
      })

      const updatedWalletAddress = await walletAddressService.get(
        walletAddress.id
      )
      assert.ok(updatedWalletAddress)

      const {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        deactivatedAt,
        updatedAt: originalUpdatedAt,
        ...originalRest
      } = walletAddress
      expect(updatedWalletAddress).toMatchObject({
        ...originalRest,
        publicName: updateOptions.publicName
      })
      expect(updatedWalletAddress.deactivatedAt).toBeDefined()
      expect(updatedWalletAddress.isActive).toBe(false)
      expect(updatedWalletAddress.updatedAt.getTime()).toBeGreaterThan(
        originalUpdatedAt.getTime()
      )
    })

    describe('Wallet Address Additional Properties', (): void => {
      test('Can add new additional properties to existing wallet address with no additional properties', async (): Promise<void> => {
        const updateOptions = {
          id: walletAddress.id,
          additionalProperties: [
            { key: 'newKey', value: 'newValue', visibleInOpenPayments: true }
          ]
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
                updateWalletAddress(input: $input) {
                  code
                  success
                  message
                  walletAddress {
                    id
                    additionalProperties {
                      key
                      value
                      visibleInOpenPayments
                    }
                  }
                }
              }
            `,
            variables: {
              input: updateOptions
            }
          })
          .then((query): UpdateWalletAddressMutationResponse => {
            if (query.data) {
              return query.data.updateWalletAddress
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.walletAddress?.additionalProperties).toEqual(
          updateOptions.additionalProperties.map((property) => {
            return {
              ...property,
              __typename: 'AdditionalProperty'
            }
          })
        )
      })
      test('New additional properties override previous additional properties', async (): Promise<void> => {
        const createOptions = {
          additionalProperties: [
            {
              fieldKey: 'existingKey',
              fieldValue: 'existingValue',
              visibleInOpenPayments: false
            },
            {
              fieldKey: 'existingKey2',
              fieldValue: 'existingValue2',
              visibleInOpenPayments: false
            }
          ]
        }
        walletAddress = await createWalletAddress(deps, createOptions)

        const updateOptions = {
          id: walletAddress.id,
          additionalProperties: [
            { key: 'newKey', value: 'newValue', visibleInOpenPayments: true },
            {
              key: 'existingKey2',
              value: 'updatedExistingValue2',
              visibleInOpenPayments: false
            }
          ]
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
                updateWalletAddress(input: $input) {
                  code
                  success
                  message
                  walletAddress {
                    id
                    additionalProperties {
                      key
                      value
                      visibleInOpenPayments
                    }
                  }
                }
              }
            `,
            variables: {
              input: updateOptions
            }
          })
          .then((query): UpdateWalletAddressMutationResponse => {
            if (query.data) {
              return query.data.updateWalletAddress
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        // Does not include additional properties from create that were not also in the update
        expect(response.walletAddress?.additionalProperties).toEqual(
          updateOptions.additionalProperties.map((property) => {
            return {
              ...property,
              __typename: 'AdditionalProperty'
            }
          })
        )
      })
      test('Empty additional properties is a no-op', async (): Promise<void> => {
        const createOptions = {
          additionalProperties: [
            {
              fieldKey: 'existingKey',
              fieldValue: 'existingValue',
              visibleInOpenPayments: false
            }
          ]
        }
        walletAddress = await createWalletAddress(deps, createOptions)

        const updateOptions = {
          id: walletAddress.id,
          additionalProperties: []
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
                updateWalletAddress(input: $input) {
                  code
                  success
                  message
                  walletAddress {
                    id
                    additionalProperties {
                      key
                      value
                      visibleInOpenPayments
                    }
                  }
                }
              }
            `,
            variables: {
              input: updateOptions
            }
          })
          .then((query): UpdateWalletAddressMutationResponse => {
            if (query.data) {
              return query.data.updateWalletAddress
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        // Has original additional properties - updating with [] did nothing
        expect(response.walletAddress?.additionalProperties).toEqual(
          createOptions.additionalProperties.map((property) => {
            return {
              key: property.fieldKey,
              value: property.fieldValue,
              visibleInOpenPayments: property.visibleInOpenPayments,
              __typename: 'AdditionalProperty'
            }
          })
        )
      })
    })

    test.each`
      error
      ${WalletAddressError.InvalidUrl}
      ${WalletAddressError.UnknownAsset}
      ${WalletAddressError.UnknownWalletAddress}
    `('4XX - $error', async ({ error }): Promise<void> => {
      jest.spyOn(walletAddressService, 'update').mockResolvedValueOnce(error)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
              updateWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: walletAddress.id,
              status: WalletAddressStatus.Inactive
            }
          }
        })
        .then((query): UpdateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.updateWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual(
        errorToCode[error as WalletAddressError].toString()
      )
      expect(response.message).toEqual(
        errorToMessage[error as WalletAddressError]
      )
    })

    test('Returns error if unexpected error', async (): Promise<void> => {
      jest
        .spyOn(walletAddressService, 'update')
        .mockImplementationOnce(async () => {
          throw new Error('unexpected')
        })
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateWalletAddress($input: UpdateWalletAddressInput!) {
              updateWalletAddress(input: $input) {
                code
                success
                message
                walletAddress {
                  id
                }
              }
            }
          `,
          variables: {
            input: {
              id: walletAddress.id,
              status: WalletAddressStatus.Inactive
            }
          }
        })
        .then((query): UpdateWalletAddressMutationResponse => {
          if (query.data) {
            return query.data.updateWalletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toEqual('500')
      expect(response.message).toEqual('Error trying to update wallet address')
    })
  })

  describe('Wallet Address Queries', (): void => {
    test.each`
      publicName
      ${'Alice'}
      ${undefined}
    `(
      'Can get a wallet address (publicName: $publicName)',
      async ({ publicName }): Promise<void> => {
        const walletProp01 = new WalletAddressAdditionalProperty()
        walletProp01.fieldKey = 'key-test-query-one'
        walletProp01.fieldValue = 'value-test-query'
        walletProp01.visibleInOpenPayments = true
        const walletProp02 = new WalletAddressAdditionalProperty()
        walletProp02.fieldKey = 'key-test-query-two'
        walletProp02.fieldValue = 'value-test-query'
        walletProp02.visibleInOpenPayments = false
        const additionalProperties = [walletProp01, walletProp02]

        const walletAddress = await createWalletAddress(deps, {
          publicName,
          createLiquidityAccount: true,
          additionalProperties
        })
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              query WalletAddress($walletAddressId: String!) {
                walletAddress(id: $walletAddressId) {
                  id
                  liquidity
                  asset {
                    code
                    scale
                  }
                  url
                  publicName
                  additionalProperties {
                    key
                    value
                    visibleInOpenPayments
                  }
                }
              }
            `,
            variables: {
              walletAddressId: walletAddress.id
            }
          })
          .then((query): WalletAddress => {
            if (query.data) {
              return query.data.walletAddress
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(query).toEqual({
          __typename: 'WalletAddress',
          id: walletAddress.id,
          liquidity: '0',
          asset: {
            __typename: 'Asset',
            code: walletAddress.asset.code,
            scale: walletAddress.asset.scale
          },
          url: walletAddress.url,
          publicName: publicName ?? null,
          additionalProperties: [
            {
              __typename: 'AdditionalProperty',
              key: walletProp01.fieldKey,
              value: walletProp01.fieldValue,
              visibleInOpenPayments: walletProp01.visibleInOpenPayments
            },
            {
              __typename: 'AdditionalProperty',
              key: walletProp02.fieldKey,
              value: walletProp02.fieldValue,
              visibleInOpenPayments: walletProp02.visibleInOpenPayments
            }
          ]
        })
      }
    )

    test('Returns error for unknown wallet address', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query WalletAddress($walletAddressId: String!) {
              walletAddress(id: $walletAddressId) {
                id
              }
            }
          `,
          variables: {
            walletAddressId: uuid()
          }
        })
        .then((query): WalletAddress => {
          if (query.data) {
            return query.data.walletAddress
          } else {
            throw new Error('Data was empty')
          }
        })

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })

    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () => createWalletAddress(deps),
      pagedQuery: 'walletAddresses'
    })

    test('Can get page of wallet addresses', async (): Promise<void> => {
      const walletAddresses: WalletAddressModel[] = []
      for (let i = 0; i < 2; i++) {
        walletAddresses.push(await createWalletAddress(deps))
      }
      walletAddresses.reverse() // Calling the default getPage will result in descending order
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query WalletAddresses {
              walletAddresses {
                edges {
                  node {
                    id
                    asset {
                      code
                      scale
                    }
                    url
                    publicName
                  }
                  cursor
                }
              }
            }
          `
        })
        .then((query): WalletAddressesConnection => {
          if (query.data) {
            return query.data.walletAddresses
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const walletAddress = walletAddresses[idx]
        expect(edge.cursor).toEqual(walletAddress.id)
        expect(edge.node).toEqual({
          __typename: 'WalletAddress',
          id: walletAddress.id,
          asset: {
            __typename: 'Asset',
            code: walletAddress.asset.code,
            scale: walletAddress.asset.scale
          },
          url: walletAddress.url,
          publicName: walletAddress.publicName
        })
      })
    })
  })

  describe('Trigger Wallet Address Events', (): void => {
    test.each`
      limit | count
      ${1}  | ${1}
      ${5}  | ${2}
    `(
      'Can trigger wallet address events (limit: $limit)',
      async ({ limit, count }): Promise<void> => {
        const accountingService = await deps.use('accountingService')
        const walletAddresses: WalletAddressModel[] = []
        const withdrawalAmount = BigInt(10)
        for (let i = 0; i < 3; i++) {
          const walletAddress = await createWalletAddress(deps, {
            createLiquidityAccount: true
          })
          if (i) {
            await expect(
              accountingService.createDeposit({
                id: uuid(),
                account: walletAddress,
                amount: withdrawalAmount
              })
            ).resolves.toBeUndefined()
            await walletAddress.$query(knex).patch({
              processAt: new Date()
            })
          }
          walletAddresses.push(walletAddress)
        }
        const response = await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation TriggerWalletAddressEvents(
                $input: TriggerWalletAddressEventsInput!
              ) {
                triggerWalletAddressEvents(input: $input) {
                  code
                  success
                  message
                  count
                }
              }
            `,
            variables: {
              input: {
                limit,
                idempotencyKey: uuid()
              }
            }
          })
          .then((query): TriggerWalletAddressEventsMutationResponse => {
            if (query.data) {
              return query.data.triggerWalletAddressEvents
            } else {
              throw new Error('Data was empty')
            }
          })

        expect(response.success).toBe(true)
        expect(response.code).toEqual('200')
        expect(response.count).toEqual(count)
        await expect(
          WalletAddressEvent.query(knex).where({
            type: WalletAddressEventType.WalletAddressWebMonetization
          })
        ).resolves.toHaveLength(count)
        for (let i = 1; i <= count; i++) {
          await expect(
            walletAddressService.get(walletAddresses[i].id)
          ).resolves.toMatchObject({
            processAt: null,
            totalEventsAmount: withdrawalAmount
          })
        }
      }
    )

    test('500', async (): Promise<void> => {
      jest
        .spyOn(walletAddressService, 'triggerEvents')
        .mockRejectedValueOnce(new Error('unexpected'))
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation TriggerWalletAddressEvents(
              $input: TriggerWalletAddressEventsInput!
            ) {
              triggerWalletAddressEvents(input: $input) {
                code
                success
                message
                count
              }
            }
          `,
          variables: {
            input: {
              limit: 1
            }
          }
        })
        .then((query): TriggerWalletAddressEventsMutationResponse => {
          if (query.data) {
            return query.data.triggerWalletAddressEvents
          } else {
            throw new Error('Data was empty')
          }
        })
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe(
        'Error trying to trigger wallet address events'
      )
      expect(response.count).toBeNull()
    })
  })
})
