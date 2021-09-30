import { gql } from 'apollo-server-koa'
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
  CreateSubAccountMutationResponse,
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
      accountFactory = new AccountFactory(accountService)
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          outgoing: account.http!.outgoing
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
      const superAccount = await accountFactory.build()
      const account = await accountFactory.build({
        superAccountId: superAccount.id,
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
      const subAccount = await accountFactory.build({
        superAccountId: account.id
      })
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
                superAccountId
                superAccount {
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
                subAccounts {
                  edges {
                    node {
                      id
                      asset {
                        code
                        scale
                      }
                      disabled
                      superAccountId
                      stream {
                        enabled
                      }
                    }
                    cursor
                  }
                }
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
                balance {
                  balance
                  availableCredit
                  creditExtended
                  totalBorrowed
                  totalLent
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
        },
        http: {
          __typename: 'Http',
          outgoing: {
            __typename: 'HttpOutgoing',
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...account.http!.outgoing
          }
        },
        routing: {
          __typename: 'Routing',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          staticIlpAddress: account.routing!.staticIlpAddress
        },
        superAccountId: superAccount.id,
        superAccount: {
          __typename: 'Account',
          id: superAccount.id,
          asset: {
            __typename: 'Asset',
            code: superAccount.asset.code,
            scale: superAccount.asset.scale
          },
          disabled: superAccount.disabled,
          stream: {
            __typename: 'Stream',
            enabled: superAccount.stream.enabled
          }
        },
        subAccounts: {
          __typename: 'SubAccountsConnection',
          edges: [
            {
              __typename: 'AccountEdge',
              cursor: subAccount.id,
              node: {
                __typename: 'Account',
                id: subAccount.id,
                asset: {
                  __typename: 'Asset',
                  code: subAccount.asset.code,
                  scale: subAccount.asset.scale
                },
                disabled: subAccount.disabled,
                superAccountId: account.id,
                stream: {
                  __typename: 'Stream',
                  enabled: subAccount.stream.enabled
                }
              }
            }
          ]
        },
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        maxPacketAmount: account.maxPacketAmount!.toString(),
        balance: {
          __typename: 'Balance',
          balance: '0',
          availableCredit: '0',
          creditExtended: '0',
          totalBorrowed: '0',
          totalLent: '0'
        }
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

    test('Returns error for unknown super-account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                superAccount {
                  id
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
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              ...account.http!.outgoing
            }
          },
          routing: {
            __typename: 'Routing',
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            staticIlpAddress: account.routing!.staticIlpAddress
          },
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          maxPacketAmount: account.maxPacketAmount!.toString()
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

  describe('SubAccounts Queries', (): void => {
    let account: AccountModel
    let subAccounts: AccountModel[]

    beforeEach(
      async (): Promise<void> => {
        account = await accountFactory.build()
        subAccounts = []
        for (let i = 0; i < 50; i++) {
          subAccounts.push(
            await accountFactory.build({
              superAccountId: account.id
            })
          )
        }
      }
    )
    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                subAccounts {
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

      expect(query.subAccounts.edges).toHaveLength(20)
      expect(query.subAccounts.pageInfo.hasNextPage).toBeTruthy()
      expect(query.subAccounts.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.subAccounts.pageInfo.startCursor).toEqual(subAccounts[0].id)
      expect(query.subAccounts.pageInfo.endCursor).toEqual(subAccounts[19].id)
    }, 10_000)

    test('No sub-accounts, but sub-accounts requested', async (): Promise<void> => {
      account = await accountFactory.build()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                subAccounts {
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
      expect(query.subAccounts.edges).toHaveLength(0)
      expect(query.subAccounts.pageInfo.hasNextPage).toBeFalsy()
      expect(query.subAccounts.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.subAccounts.pageInfo.startCursor).toBeNull()
      expect(query.subAccounts.pageInfo.endCursor).toBeNull()
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!) {
              account(id: $accountId) {
                subAccounts(first: 10) {
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
      expect(query.subAccounts.edges).toHaveLength(10)
      expect(query.subAccounts.pageInfo.hasNextPage).toBeTruthy()
      expect(query.subAccounts.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.subAccounts.pageInfo.startCursor).toEqual(subAccounts[0].id)
      expect(query.subAccounts.pageInfo.endCursor).toEqual(subAccounts[9].id)
    }, 10_000)

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!, $after: String!) {
              account(id: $accountId) {
                subAccounts(after: $after) {
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
            }
          `,
          variables: {
            accountId: account.id,
            after: subAccounts[19].id
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
      expect(query.subAccounts.edges).toHaveLength(20)
      expect(query.subAccounts.pageInfo.hasNextPage).toBeTruthy()
      expect(query.subAccounts.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.subAccounts.pageInfo.startCursor).toEqual(subAccounts[20].id)
      expect(query.subAccounts.pageInfo.endCursor).toEqual(subAccounts[39].id)
    }, 10_000)

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($accountId: String!, $after: String!) {
              account(id: $accountId) {
                subAccounts(after: $after, first: 10) {
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
            }
          `,
          variables: {
            accountId: account.id,
            after: subAccounts[44].id
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
      expect(query.subAccounts.edges).toHaveLength(5)
      expect(query.subAccounts.pageInfo.hasNextPage).toBeFalsy()
      expect(query.subAccounts.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.subAccounts.pageInfo.startCursor).toEqual(subAccounts[45].id)
      expect(query.subAccounts.pageInfo.endCursor).toEqual(subAccounts[49].id)
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...updateOptions.http!.outgoing
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
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          outgoing: updateOptions.http!.outgoing
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
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            ...account.http!.outgoing
          }
        },
        routing: {
          __typename: 'Routing',
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
          staticIlpAddress: account.routing!.staticIlpAddress
        },
        stream: {
          __typename: 'Stream',
          enabled: account.stream.enabled
        }
      })
      const updatedAccount = await accountService.get(account.id)
      await expect(updatedAccount).toMatchObject({
        ...account,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        updatedAt: updatedAccount!.updatedAt,
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

  describe('Create Sub-Account', (): void => {
    test('Can create an sub-account', async (): Promise<void> => {
      const superAccount = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateSubAccount($superAccountId: String!) {
              createSubAccount(superAccountId: $superAccountId) {
                code
                success
                message
                account {
                  id
                  superAccountId
                }
              }
            }
          `,
          variables: {
            superAccountId: superAccount.id
          }
        })
        .then(
          (query): CreateSubAccountMutationResponse => {
            if (query.data) {
              return query.data.createSubAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.account?.id).not.toBeNull()
      expect(response.account?.superAccountId).toEqual(superAccount.id)
      if (response.account) {
        await expect(
          accountService.get(response.account.id)
        ).resolves.toMatchObject({
          id: response.account.id,
          asset: superAccount.asset,
          superAccountId: superAccount.id,
          disabled: false,
          stream: {
            enabled: false
          }
        })
      } else {
        fail()
      }
    })

    test('Returns error for unknown super-account', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateSubAccount($superAccountId: String!) {
              createSubAccount(superAccountId: $superAccountId) {
                code
                success
                message
                account {
                  id
                  superAccountId
                }
              }
            }
          `,
          variables: {
            superAccountId: uuid()
          }
        })
        .then(
          (query): CreateSubAccountMutationResponse => {
            if (query.data) {
              return query.data.createSubAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(false)
      expect(response.code).toEqual('404')
      expect(response.message).toEqual('Unknown super-account')
    })
  })
})
