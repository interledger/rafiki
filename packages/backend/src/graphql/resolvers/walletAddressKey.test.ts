import assert from 'assert'
import { ApolloError, gql } from '@apollo/client'
import { generateJwk } from '@interledger/http-signature-utils'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  CreateWalletAddressKeyInput,
  CreateWalletAddressKeyMutationResponse,
  RevokeWalletAddressKeyMutationResponse,
  JwkInput
} from '../generated/graphql'
import { WalletAddressKeyService } from '../../open_payments/wallet_address/key/service'
import { createWalletAddress } from '../../tests/walletAddress'
import { getPageTests } from './page.test'
import { createWalletAddressKey } from '../../tests/walletAddressKey'
import { GraphQLErrorCode } from '../errors'
import {
  errorToCode,
  errorToMessage,
  isWalletAddressKeyError,
  WalletAddressKeyError
} from '../../open_payments/wallet_address/key/errors'

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Wallet Address Key Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressKeyService: WalletAddressKeyService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    walletAddressKeyService = await deps.use('walletAddressKeyService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Wallet Address Keys', (): void => {
    test('Can create wallet address key', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const input: CreateWalletAddressKeyInput = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY as JwkInput
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWalletAddressKey(
              $input: CreateWalletAddressKeyInput!
            ) {
              createWalletAddressKey(input: $input) {
                walletAddressKey {
                  id
                  walletAddressId
                  jwk {
                    kid
                    x
                    alg
                    kty
                    crv
                  }
                  revoked
                  createdAt
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): CreateWalletAddressKeyMutationResponse => {
          if (query.data) {
            return query.data.createWalletAddressKey
          } else {
            throw new Error('Data was empty')
          }
        })

      assert.ok(response.walletAddressKey)
      expect(response.walletAddressKey).toMatchObject({
        __typename: 'WalletAddressKey',
        walletAddressId: input.walletAddressId,
        jwk: {
          __typename: 'Jwk',
          ...TEST_KEY
        },
        revoked: false
      })
    })
    test('Cannot add duplicate key', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const input: CreateWalletAddressKeyInput = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY as JwkInput
      }

      await walletAddressKeyService.create(input)

      expect.assertions(2)

      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateWalletAddressKey(
                $input: CreateWalletAddressKeyInput!
              ) {
                createWalletAddressKey(input: $input) {
                  walletAddressKey {
                    id
                    walletAddressId
                    jwk {
                      kid
                      x
                      alg
                      kty
                      crv
                    }
                    revoked
                    createdAt
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): CreateWalletAddressKeyMutationResponse => {
            if (query.data) {
              return query.data.createWalletAddressKey
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: errorToMessage[WalletAddressKeyError.DuplicateKey],
            extensions: expect.objectContaining({
              code: errorToCode[WalletAddressKeyError.DuplicateKey]
            })
          })
        )
      }
    })

    test('internal server error', async (): Promise<void> => {
      jest
        .spyOn(walletAddressKeyService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const input = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation CreateWalletAddressKey(
                $input: CreateWalletAddressKeyInput!
              ) {
                createWalletAddressKey(input: $input) {
                  walletAddressKey {
                    id
                    walletAddressId
                    jwk {
                      kid
                      x
                      alg
                      kty
                      crv
                    }
                    createdAt
                  }
                }
              }
            `,
            variables: {
              input
            }
          })
          .then((query): CreateWalletAddressKeyMutationResponse => {
            if (query.data) {
              return query.data.createWalletAddressKey
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'unexpected',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.InternalServerError
            })
          })
        )
      }
    })
  })

  describe('Revoke key', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps, {
        tenantId: Config.operatorTenantId
      })

      const key = await walletAddressKeyService.create({
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      })
      assert.ok(!isWalletAddressKeyError(key))

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeWalletAddressKey(
              $input: RevokeWalletAddressKeyInput!
            ) {
              revokeWalletAddressKey(input: $input) {
                walletAddressKey {
                  id
                  walletAddressId
                  jwk {
                    kid
                    x
                    alg
                    kty
                    crv
                  }
                  revoked
                }
              }
            }
          `,
          variables: {
            input: {
              id: key.id
            }
          }
        })
        .then((query): RevokeWalletAddressKeyMutationResponse => {
          if (query.data) {
            return query.data.revokeWalletAddressKey
          } else {
            throw new Error('Data was empty')
          }
        })

      assert.ok(response.walletAddressKey)
      expect(response.walletAddressKey).toMatchObject({
        __typename: 'WalletAddressKey',
        id: key.id,
        walletAddressId: key.walletAddressId,
        jwk: {
          ...key.jwk,
          __typename: 'Jwk'
        },
        revoked: true
      })
    })

    test('Returns not found if key does not exist', async (): Promise<void> => {
      expect.assertions(2)
      try {
        await appContainer.apolloClient
          .mutate({
            mutation: gql`
              mutation revokeWalletAddressKey(
                $input: RevokeWalletAddressKeyInput!
              ) {
                revokeWalletAddressKey(input: $input) {
                  walletAddressKey {
                    id
                    walletAddressId
                  }
                }
              }
            `,
            variables: {
              input: {
                id: uuid()
              }
            }
          })
          .then((query): RevokeWalletAddressKeyMutationResponse => {
            if (query.data) {
              return query.data.revokeWalletAddressKey
            } else {
              throw new Error('Data was empty')
            }
          })
      } catch (error) {
        expect(error).toBeInstanceOf(ApolloError)
        expect((error as ApolloError).graphQLErrors).toContainEqual(
          expect.objectContaining({
            message: 'Wallet address key not found',
            extensions: expect.objectContaining({
              code: GraphQLErrorCode.NotFound
            })
          })
        )
      }
    })
  })

  describe('List Wallet Address Keys', (): void => {
    let walletAddressId: string
    beforeEach(async (): Promise<void> => {
      walletAddressId = (
        await createWalletAddress(deps, { tenantId: Config.operatorTenantId })
      ).id
    })
    getPageTests({
      getClient: () => appContainer.apolloClient,
      createModel: () => createWalletAddressKey(deps, walletAddressId),
      pagedQuery: 'walletAddressKeys',
      parent: {
        query: 'walletAddress',
        getId: () => walletAddressId
      }
    })
  })
})
