import assert from 'assert'
import { faker } from '@faker-js/faker'
import { gql } from 'apollo-server-koa'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
  RevokeGrantInput,
  RevokeGrantMutationResponse
} from '../generated/graphql'
import {
  Grant as GrantModel,
  GrantState as GrantModelState,
  FinishMethod,
  StartMethod
} from '../../grant/model'
import { generateNonce, generateToken } from '../../shared/utils'
import { Access } from '../../access/model'
import { AccessAction, AccessType } from 'open-payments'

describe('Grant Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grant: GrantModel

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  const CLIENT = faker.internet.url()
  const CLIENT_KEY_ID = uuid()
  const BASE_GRANT_ACCESS = {
    actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
    identifier: `https://example.com/${uuid()}`
  }

  beforeEach(async (): Promise<void> => {
    grant = await GrantModel.query().insert({
      state: GrantModelState.Pending,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: uuid(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com',
      clientNonce: generateNonce(),
      client: CLIENT,
      clientKeyId: CLIENT_KEY_ID,
      interactId: uuid(),
      interactRef: uuid(),
      interactNonce: generateNonce()
    })

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      type: AccessType.IncomingPayment,
      grantId: grant.id
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.apolloClient.stop()
    await appContainer.shutdown()
  })

  describe('Revoke key', (): void => {
    test('Can revoke a grant', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        id: grant.id
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
                grant {
                  id
                  state
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): RevokeGrantMutationResponse => {
          if (query.data) {
            return query.data.revokeGrant
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(true)
      expect(response.code).toBe('200')
      assert.ok(response.grant)
      expect(response.grant).toMatchObject({
        __typename: 'Grant',
        id: grant.id,
        state: 'rejected'
      })
    })

    test('Returns 404 if id does not exist', async (): Promise<void> => {
      const input: RevokeGrantInput = {
        id: uuid()
      }

      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation revokeGrant($input: RevokeGrantInput!) {
              revokeGrant(input: $input) {
                code
                success
                message
                grant {
                  id
                  state
                }
              }
            }
          `,
          variables: {
            input
          }
        })
        .then((query): RevokeGrantMutationResponse => {
          if (query.data) {
            return query.data.revokeGrant
          } else {
            throw new Error('Data was empty')
          }
        })

      expect(response.success).toBe(false)
      expect(response.code).toBe('404')
      expect(response.message).toBe('Grant id not found')
      expect(response.grant).toBeNull()
    })
  })
})
