import assert from 'assert'
import { gql } from '@apollo/client'
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

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Wallet Address Key Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddressKeyService: WalletAddressKeyService

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    walletAddressKeyService = await deps.use('walletAddressKeyService')
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Create Wallet Address Keys', (): void => {
    test('Can create wallet address key', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps)

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
                code
                success
                message
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

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
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

    test('500', async (): Promise<void> => {
      jest
        .spyOn(walletAddressKeyService, 'create')
        .mockImplementationOnce(async (_args) => {
          throw new Error('unexpected')
        })

      const walletAddress = await createWalletAddress(deps)

      const input = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateWalletAddressKey(
              $input: CreateWalletAddressKeyInput!
            ) {
              createWalletAddressKey(input: $input) {
                code
                success
                message
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
      expect(response.code).toBe('500')
      expect(response.success).toBe(false)
      expect(response.message).toBe('Error trying to create wallet address key')
    })
  })

  describe('Revoke key', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const walletAddress = await createWalletAddress(deps)

      const key = await walletAddressKeyService.create({
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      })

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeWalletAddressKey(
              $input: RevokeWalletAddressKeyInput!
            ) {
              revokeWalletAddressKey(input: $input) {
                code
                success
                message
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

      expect(response.success).toBe(true)
      expect(response.code).toBe('200')
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

    test('Returns 404 if key does not exist', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeWalletAddressKey(
              $input: RevokeWalletAddressKeyInput!
            ) {
              revokeWalletAddressKey(input: $input) {
                code
                success
                message
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

      expect(response.success).toBe(false)
      expect(response.code).toBe('404')
      expect(response.message).toBe('Wallet address key not found')
      expect(response.walletAddressKey).toBeNull()
    })
  })
})
