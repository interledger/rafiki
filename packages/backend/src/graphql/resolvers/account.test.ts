import { gql } from 'apollo-server-koa'
import assert from 'assert'
import Knex from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { truncateTables } from '../../tests/tableManager'
import { Account as AccountModel, AccountService } from '../../account/service'
import { AccountFactory } from '../../tests/accountFactory'
import { randomAsset } from '../../tests/asset'
import {
  CreateAccountInput,
  CreateAccountMutationResponse,
  Account,
  AccountsConnection,
  UpdateAccountInput,
  UpdateAccountMutationResponse
} from '../generated/graphql'

describe('Account Resolvers', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let knex: Knex
  let accountService: AccountService
  let accountFactory: AccountFactory

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      accountService = await deps.use('accountService')
      const transferService = await deps.use('transferService')
      accountFactory = new AccountFactory(accountService, transferService)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe('Create Account', (): void => {
    test('Can create an account', async (): Promise<void> => {
      const account: CreateAccountInput = {
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.account?.id).not.toBeNull()
      if (response.account) {
        await expect(
          accountService.get(response.account.id)
        ).resolves.toMatchObject({
          id: response.account.id,
          asset: account.asset,
          disabled: false,
          stream: {
            enabled: false
          }
        })
      } else {
        fail()
      }
    })

    test('Can create an account with all settings', async (): Promise<void> => {
      const id = uuid()
      const account = {
        id,
        asset: randomAsset(),
        disabled: true,
        maxPacketAmount: '100',
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: false
        },
        routing: {
          staticIlpAddress: 'g.rafiki.' + id
        }
      }
      assert.ok(account.http)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.account?.id).toEqual(id)
      await expect(accountService.get(id)).resolves.toMatchObject({
        ...account,
        http: {
          outgoing: account.http.outgoing
        },
        maxPacketAmount: BigInt(account.maxPacketAmount)
      })
    })

    test('Returns error for duplicate account', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      const account: CreateAccountInput = {
        id,
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Account already exists')
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const http = {
        incoming: {
          authTokens: [uuid()]
        },
        outgoing: {
          authToken: uuid(),
          endpoint: '/outgoingEndpoint'
        }
      }
      await accountFactory.build({ http })
      const account: CreateAccountInput = {
        asset: randomAsset(),
        http
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateAccount($input: CreateAccountInput!) {
              createAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: account
          }
        })
        .then(
          (query): CreateAccountMutationResponse => {
            if (query.data) {
              return query.data.createAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Incoming token already exists')
    })
  })

  describe('Account Queries', (): void => {
    test('Can get an account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
                asset {
                  code
                  scale
                }
                disabled
                stream {
                  enabled
                }
              }
            }
          `,
          variables: {
            accountId: account.id
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.account
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toEqual({
        __typename: 'Account',
        id: account.id,
        asset: {
          __typename: 'Asset',
          code: account.asset.code,
          scale: account.asset.scale
        },
        disabled: account.disabled,
        stream: {
          __typename: 'Stream',
          enabled: account.stream.enabled
        }
      })
    })

    test('Can get all account fields', async (): Promise<void> => {
      const balance = BigInt(10)
      const account = await accountFactory.build({
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        routing: {
          staticIlpAddress: 'g.rafiki.test'
        },
        balance
      })
      assert.ok(account.http)
      assert.ok(account.routing)
      assert.ok(account.maxPacketAmount)
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
                asset {
                  code
                  scale
                }
                disabled
                maxPacketAmount
                http {
                  outgoing {
                    authToken
                    endpoint
                  }
                }
                stream {
                  enabled
                }
                routing {
                  staticIlpAddress
                }
                balance
              }
            }
          `,
          variables: {
            accountId: account.id
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.account
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toEqual({
        __typename: 'Account',
        id: account.id,
        asset: {
          __typename: 'Asset',
          code: account.asset.code,
          scale: account.asset.scale
        },
        disabled: account.disabled,
        stream: {
          __typename: 'Stream',
          enabled: account.stream.enabled
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...account.http.outgoing
          }
        },
        routing: {
          __typename: 'Routing',
          staticIlpAddress: account.routing.staticIlpAddress
        },
        maxPacketAmount: account.maxPacketAmount.toString(),
        balance: balance.toString()
      })
    })

    test('Returns error for unknown account', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                id
                asset {
                  code
                  scale
                }
                disabled
                stream {
                  enabled
                }
              }
            }
          `,
          variables: {
            accountId: uuid()
          }
        })
        .then(
          (query): Account => {
            if (query.data) {
              return query.data.account
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('Accounts Queries', (): void => {
    test('Can get accounts', async (): Promise<void> => {
      const accounts: AccountModel[] = []
      for (let i = 0; i < 2; i++) {
        accounts.push(await accountFactory.build())
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts {
              accounts {
                edges {
                  node {
                    id
                    asset {
                      code
                      scale
                    }
                    disabled
                    stream {
                      enabled
                    }
                  }
                  cursor
                }
              }
            }
          `
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const account = accounts[idx]
        expect(edge.cursor).toEqual(account.id)
        expect(edge.node).toEqual({
          __typename: 'Account',
          id: account.id,
          asset: {
            __typename: 'Asset',
            code: account.asset.code,
            scale: account.asset.scale
          },
          disabled: account.disabled,
          stream: {
            __typename: 'Stream',
            enabled: account.stream.enabled
          }
        })
      })
    })

    test('Can get all accounts fields', async (): Promise<void> => {
      const accounts: AccountModel[] = []
      for (let i = 0; i < 2; i++) {
        accounts.push(
          await accountFactory.build({
            maxPacketAmount: BigInt(100),
            http: {
              incoming: {
                authTokens: [uuid()]
              },
              outgoing: {
                authToken: uuid(),
                endpoint: '/outgoingEndpoint'
              }
            },
            routing: {
              staticIlpAddress: 'g.rafiki.test'
            }
          })
        )
      }

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts {
              accounts {
                edges {
                  node {
                    id
                    asset {
                      code
                      scale
                    }
                    disabled
                    maxPacketAmount
                    http {
                      outgoing {
                        authToken
                        endpoint
                      }
                    }
                    stream {
                      enabled
                    }
                    routing {
                      staticIlpAddress
                    }
                  }
                  cursor
                }
              }
            }
          `
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        const account = accounts[idx]
        assert.ok(account.http)
        assert.ok(account.routing)
        assert.ok(account.maxPacketAmount)
        expect(edge.cursor).toEqual(account.id)
        expect(edge.node).toEqual({
          __typename: 'Account',
          id: account.id,
          asset: {
            __typename: 'Asset',
            code: account.asset.code,
            scale: account.asset.scale
          },
          disabled: account.disabled,
          stream: {
            __typename: 'Stream',
            enabled: account.stream.enabled
          },
          http: {
            __typename: 'Http',
            outgoing: {
              __typename: 'HttpOutgoing',
              ...account.http.outgoing
            }
          },
          routing: {
            __typename: 'Routing',
            staticIlpAddress: account.routing.staticIlpAddress
          },
          maxPacketAmount: account.maxPacketAmount.toString()
        })
      })
    })

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const accounts = []
      for (let i = 0; i < 50; i++) {
        accounts.push(await accountFactory.build())
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts {
              accounts {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(accounts[0].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[19].id)
    }, 10_000)

    test('No accounts, but accounts requested', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts {
              accounts {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(0)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toBeNull()
      expect(query.pageInfo.endCursor).toBeNull()
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const accounts = []
      for (let i = 0; i < 50; i++) {
        accounts.push(await accountFactory.build())
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts {
              accounts(first: 10) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(10)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.pageInfo.startCursor).toEqual(accounts[0].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[9].id)
    }, 10_000)

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const accounts = []
      for (let i = 0; i < 50; i++) {
        accounts.push(await accountFactory.build())
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts($after: String!) {
              accounts(after: $after) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `,
          variables: {
            after: accounts[19].id
          }
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(20)
      expect(query.pageInfo.hasNextPage).toBeTruthy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(accounts[20].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[39].id)
    }, 10_000)

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const accounts = []
      for (let i = 0; i < 50; i++) {
        accounts.push(await accountFactory.build())
      }
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Accounts($after: String!) {
              accounts(after: $after, first: 10) {
                edges {
                  node {
                    id
                  }
                  cursor
                }
                pageInfo {
                  endCursor
                  hasNextPage
                  hasPreviousPage
                  startCursor
                }
              }
            }
          `,
          variables: {
            after: accounts[44].id
          }
        })
        .then(
          (query): AccountsConnection => {
            if (query.data) {
              return query.data.accounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.edges).toHaveLength(5)
      expect(query.pageInfo.hasNextPage).toBeFalsy()
      expect(query.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.pageInfo.startCursor).toEqual(accounts[45].id)
      expect(query.pageInfo.endCursor).toEqual(accounts[49].id)
    }, 10_000)
  })

  describe('Update Account', (): void => {
    test('Can update an account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const updateOptions = {
        id: account.id,
        disabled: true,
        maxPacketAmount: '100',
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: false
        },
        routing: {
          staticIlpAddress: 'g.rafiki.' + account.id
        }
      }
      assert.ok(updateOptions.http)
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateAccount($input: UpdateAccountInput!) {
              updateAccount(input: $input) {
                code
                success
                message
                account {
                  id
                  disabled
                  maxPacketAmount
                  http {
                    outgoing {
                      authToken
                      endpoint
                    }
                  }
                  stream {
                    enabled
                  }
                  routing {
                    staticIlpAddress
                  }
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then(
          (query): UpdateAccountMutationResponse => {
            if (query.data) {
              return query.data.updateAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.account).toEqual({
        __typename: 'Account',
        ...updateOptions,
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...updateOptions.http.outgoing
          }
        },
        routing: {
          __typename: 'Routing',
          staticIlpAddress: updateOptions.routing.staticIlpAddress
        },
        stream: {
          __typename: 'Stream',
          enabled: updateOptions.stream.enabled
        }
      })
      await expect(accountService.get(account.id)).resolves.toMatchObject({
        ...updateOptions,
        asset: account.asset,
        http: {
          outgoing: updateOptions.http.outgoing
        },
        maxPacketAmount: BigInt(updateOptions.maxPacketAmount)
      })
    })

    test('Can update subset of fields', async (): Promise<void> => {
      const account = await accountFactory.build({
        maxPacketAmount: BigInt(100),
        http: {
          incoming: {
            authTokens: [uuid()]
          },
          outgoing: {
            authToken: uuid(),
            endpoint: '/outgoingEndpoint'
          }
        },
        stream: {
          enabled: false
        },
        routing: {
          staticIlpAddress: 'g.rafiki.' + uuid()
        }
      })
      assert.ok(account.http)
      assert.ok(account.routing)
      const updateOptions: UpdateAccountInput = {
        id: account.id,
        disabled: true
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateAccount($input: UpdateAccountInput!) {
              updateAccount(input: $input) {
                code
                success
                message
                account {
                  id
                  disabled
                  maxPacketAmount
                  http {
                    outgoing {
                      authToken
                      endpoint
                    }
                  }
                  stream {
                    enabled
                  }
                  routing {
                    staticIlpAddress
                  }
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then(
          (query): UpdateAccountMutationResponse => {
            if (query.data) {
              return query.data.updateAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.account).toEqual({
        __typename: 'Account',
        id: account.id,
        disabled: updateOptions.disabled,
        maxPacketAmount: account.maxPacketAmount.toString(),
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            ...account.http.outgoing
          }
        },
        routing: {
          __typename: 'Routing',
          staticIlpAddress: account.routing.staticIlpAddress
        },
        stream: {
          __typename: 'Stream',
          enabled: account.stream.enabled
        }
      })
      const updatedAccount = await accountService.get(account.id)
      assert.ok(updatedAccount?.updatedAt)
      await expect(updatedAccount).toMatchObject({
        ...account,
        updatedAt: updatedAccount.updatedAt,
        disabled: updateOptions.disabled
      })
    })

    test('Returns error for unknown account', async (): Promise<void> => {
      const updateOptions: UpdateAccountInput = {
        id: uuid()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateAccount($input: UpdateAccountInput!) {
              updateAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then(
          (query): UpdateAccountMutationResponse => {
            if (query.data) {
              return query.data.updateAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown ILP account')
    })

    test('Returns error for duplicate incoming token', async (): Promise<void> => {
      const http = {
        incoming: {
          authTokens: [uuid()]
        },
        outgoing: {
          authToken: uuid(),
          endpoint: '/outgoingEndpoint'
        }
      }
      await accountFactory.build({ http })
      const { id } = await accountFactory.build()
      const updateOptions: UpdateAccountInput = {
        id,
        http
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateAccount($input: UpdateAccountInput!) {
              updateAccount(input: $input) {
                code
                success
                message
                account {
                  id
                }
              }
            }
          `,
          variables: {
            input: updateOptions
          }
        })
        .then(
          (query): UpdateAccountMutationResponse => {
            if (query.data) {
              return query.data.updateAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('409')
      expect(response.message).toEqual('Incoming token already exists')
    })
  })
})
