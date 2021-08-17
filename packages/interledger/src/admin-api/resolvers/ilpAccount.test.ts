import { Model } from 'objection'
import { Transaction } from 'knex'
import { v4 as uuid } from 'uuid'
import { ApolloError } from '@apollo/client'

import { randomAsset, AccountFactory } from '../../accounts/testsHelpers'
import { IlpAccount } from '../../accounts/types'
import { gql } from 'apollo-server'

import { createTestApp, TestContainer } from '../testsHelpers/app'
import {
  CreateIlpAccountInput,
  CreateIlpAccountMutationResponse,
  CreateIlpSubAccountMutationResponse,
  IlpAccount as IlpAccountResponse,
  IlpAccountsConnection,
  UpdateIlpAccountInput,
  UpdateIlpAccountMutationResponse
} from '../generated/graphql'

describe('Account Resolvers', (): void => {
  let accountFactory: AccountFactory
  let appContainer: TestContainer
  let trx: Transaction

  beforeAll(
    async (): Promise<void> => {
      appContainer = await createTestApp()
      accountFactory = new AccountFactory(appContainer.accountsService)
    }
  )

  beforeEach(
    async (): Promise<void> => {
      trx = await appContainer.knex.transaction()
      Model.knex(trx)
    }
  )

  afterEach(
    async (): Promise<void> => {
      await trx.rollback()
      await trx.destroy()
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.shutdown()
    }
  )

  describe('Create IlpAccount', (): void => {
    test('Can create an ilp account', async (): Promise<void> => {
      const account: CreateIlpAccountInput = {
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).not.toBeNull()
      if (response.ilpAccount) {
        const expectedAccount: IlpAccount = {
          id: response.ilpAccount.id,
          asset: account.asset,
          disabled: false,
          stream: {
            enabled: false
          }
        }
        await expect(
          appContainer.accountsService.getAccount(response.ilpAccount.id)
        ).resolves.toEqual(expectedAccount)
      } else {
        fail()
      }
    })

    test('Can create an ilp account with all settings', async (): Promise<void> => {
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
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).toEqual(id)
      await expect(
        appContainer.accountsService.getAccount(id)
      ).resolves.toEqual({
        ...account,
        http: {
          outgoing: account.http?.outgoing
        },
        maxPacketAmount: BigInt(account.maxPacketAmount)
      })
    })

    test('Returns error for duplicate account', async (): Promise<void> => {
      const { id } = await accountFactory.build()
      const account: CreateIlpAccountInput = {
        id,
        asset: randomAsset()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
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
      const account: CreateIlpAccountInput = {
        asset: randomAsset(),
        http
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpAccount($input: CreateIlpAccountInput!) {
              createIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpAccount
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

  describe('IlpAccount Queries', (): void => {
    test('Can get an ilp account', async (): Promise<void> => {
      const account = await accountFactory.build()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toMatchObject(account)
    })

    test('Can get all ilp account fields', async (): Promise<void> => {
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
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query).toMatchObject({
        ...account,
        http: {
          outgoing: account.http?.outgoing
        },
        superAccountId: superAccount.id,
        superAccount,
        subAccounts: {
          edges: [
            {
              cursor: subAccount.id,
              node: subAccount
            }
          ]
        },
        maxPacketAmount: account.maxPacketAmount?.toString(),
        balance: {
          balance: '0',
          availableCredit: '0',
          creditExtended: '0',
          totalBorrowed: '0',
          totalLent: '0'
        }
      })
    })

    test('Returns error for unknown ilp account', async (): Promise<void> => {
      const gqlQuery = appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      await expect(gqlQuery).rejects.toThrow(ApolloError)
    })
  })

  describe('IlpAccounts Queries', (): void => {
    test('Can get ilp accounts', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 2 }, async () => await accountFactory.build())
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        expect(edge.cursor).toEqual(accounts[idx].id)
        expect(edge.node).toMatchObject(accounts[idx])
      })
    })

    test('Can get all ilp accounts fields', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from(
          { length: 2 },
          async () =>
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
      )

      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(query.edges).toHaveLength(2)
      query.edges.forEach((edge, idx) => {
        expect(edge.cursor).toEqual(accounts[idx].id)
        expect(edge.node).toMatchObject({
          ...accounts[idx],
          maxPacketAmount: accounts[idx].maxPacketAmount?.toString()
        })
      })
    })

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
            query IlpAccounts {
              ilpAccounts {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts {
              ilpAccounts(first: 10) {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts($after: String!) {
              ilpAccounts(after: $after) {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
      const accounts = await Promise.all(
        Array.from({ length: 50 }, async () => await accountFactory.build())
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccounts($after: String!) {
              ilpAccounts(after: $after, first: 10) {
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
          (query): IlpAccountsConnection => {
            if (query.data) {
              return query.data.ilpAccounts
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
    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const account = await accountFactory.build()
      const subAccounts = await Promise.all(
        Array.from(
          { length: 50 },
          async () =>
            await accountFactory.build({
              superAccountId: account.id
            })
        )
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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
      const account = await accountFactory.build()
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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
      const account = await accountFactory.build()
      const subAccounts = await Promise.all(
        Array.from(
          { length: 50 },
          async () =>
            await accountFactory.build({
              superAccountId: account.id
            })
        )
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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
      const account = await accountFactory.build()
      const subAccounts = await Promise.all(
        Array.from(
          { length: 50 },
          async () =>
            await accountFactory.build({
              superAccountId: account.id
            })
        )
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!, $after: String!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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
      const account = await accountFactory.build()
      const subAccounts = await Promise.all(
        Array.from(
          { length: 50 },
          async () =>
            await accountFactory.build({
              superAccountId: account.id
            })
        )
      )
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query IlpAccount($accountId: ID!, $after: String!) {
              ilpAccount(id: $accountId) {
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
          (query): IlpAccountResponse => {
            if (query.data) {
              return query.data.ilpAccount
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

  describe('Update IlpAccount', (): void => {
    test('Can update an ilp account', async (): Promise<void> => {
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
            mutation UpdateIlpAccount($input: UpdateIlpAccountInput!) {
              updateIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): UpdateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.updateIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).not.toBeNull()
      await expect(
        appContainer.accountsService.getAccount(account.id)
      ).resolves.toEqual({
        ...updateOptions,
        asset: account.asset,
        http: {
          outgoing: updateOptions.http?.outgoing
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
      const updateOptions: UpdateIlpAccountInput = {
        id: account.id,
        disabled: true
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateIlpAccount($input: UpdateIlpAccountInput!) {
              updateIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): UpdateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.updateIlpAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).not.toBeNull()
      await expect(
        appContainer.accountsService.getAccount(account.id)
      ).resolves.toEqual({
        ...account,
        disabled: updateOptions.disabled
      })
    })

    test('Returns error for unknown account', async (): Promise<void> => {
      const updateOptions: UpdateIlpAccountInput = {
        id: uuid()
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateIlpAccount($input: UpdateIlpAccountInput!) {
              updateIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): UpdateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.updateIlpAccount
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
      const updateOptions: UpdateIlpAccountInput = {
        id,
        http
      }
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation UpdateIlpAccount($input: UpdateIlpAccountInput!) {
              updateIlpAccount(input: $input) {
                code
                success
                message
                ilpAccount {
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
          (query): UpdateIlpAccountMutationResponse => {
            if (query.data) {
              return query.data.updateIlpAccount
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

  describe('Create Ilp Sub-Account', (): void => {
    test('Can create an ilp sub-account', async (): Promise<void> => {
      const superAccount = await accountFactory.build()
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpSubAccount($superAccountId: ID!) {
              createIlpSubAccount(superAccountId: $superAccountId) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpSubAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpSubAccount
            } else {
              throw new Error('Data was empty')
            }
          }
        )

      expect(response.success).toBe(true)
      expect(response.code).toEqual('200')
      expect(response.ilpAccount?.id).not.toBeNull()
      expect(response.ilpAccount?.superAccountId).toEqual(superAccount.id)
      if (response.ilpAccount) {
        const expectedAccount: IlpAccount = {
          id: response.ilpAccount.id,
          asset: superAccount.asset,
          superAccountId: superAccount.id,
          disabled: false,
          stream: {
            enabled: false
          }
        }
        await expect(
          appContainer.accountsService.getAccount(response.ilpAccount.id)
        ).resolves.toEqual(expectedAccount)
      } else {
        fail()
      }
    })

    test('Returns error for unknown super-account', async (): Promise<void> => {
      const response = await appContainer.apolloClient
        .mutate({
          mutation: gql`
            mutation CreateIlpSubAccount($superAccountId: ID!) {
              createIlpSubAccount(superAccountId: $superAccountId) {
                code
                success
                message
                ilpAccount {
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
          (query): CreateIlpSubAccountMutationResponse => {
            if (query.data) {
              return query.data.createIlpSubAccount
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
