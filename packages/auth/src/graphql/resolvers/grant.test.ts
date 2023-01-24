import assert from 'assert'
import { gql } from 'apollo-server-koa'
import { generateJwk } from 'http-signature-utils'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import {
    Grant,
    GrantState,
    RevokeGrantMutationResponse
} from '../generated/graphql'
import { GrantService } from '../../grant/service'

describe('Grant Resolvers', (): void => {
    let deps: IocContract<AppServices>
    let appContainer: TestContainer
    let grantService: GrantService

    beforeAll(async (): Promise<void> => {
        deps = await initIocContainer(Config)
        appContainer = await createTestApp(deps)
        grantService = await deps.use('grantService')
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
            const grant: Grant = {
                identifier: uuid(),
                state: GrantState.Granted,
                createdAt: new Date().toString()
            }

            const response = await appContainer.apolloClient
                .mutate({
                    mutation: gql`
            mutation revokeGrant($identifier: String!) {
                revokeGrant(identifier: $identifier) {
                code
                success
                message
                grant {
                  identifier
                  state
                }
              }
            }
          `,
                    variables: {
                        identifier: grant.identifier
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
                __typename: 'grant',
                identifier: grant.identifier,
                state: GrantState.Revoked
            })
        })

        test('Returns 404 if identifier does not exist', async (): Promise<void> => {
            const response = await appContainer.apolloClient
                .mutate({
                    mutation: gql`
            mutation revokeGrant($identifier: String!) {
              revokeGrant(identifier: $identifier) {
                code
                success
                message
                grant {
                  identifier
                  state
                }
              }
            }
          `,
                    variables: {
                        identifier: uuid()
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
            expect(response.message).toBe('Grant identifier not found')
            expect(response.grant).toBeNull()
        })
    })
})
