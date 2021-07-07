import { gql } from 'apollo-server-koa'
import Knex from 'knex'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { User as UserModel } from '../../user/model'
import { UserService } from '../../user/service'
import { truncateTables } from '../../tests/tableManager'
import { Invoice } from '../../invoice/model'
import { InvoiceService } from '../../invoice/service'
import { User } from '../generated/graphql'

describe('Invoice Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let invoiceService: InvoiceService
  let userService: UserService
  let knex: Knex
  let invoices: Invoice[]
  let user: UserModel

  beforeAll(
    async (): Promise<void> => {
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      invoiceService = await deps.use('invoiceService')
      userService = await deps.use('userService')
      user = await userService.create()
      invoices = []
      for (let i = 0; i < 50; i++) {
        invoices.push(await invoiceService.create(user.id))
      }
    }
  )

  afterAll(
    async (): Promise<void> => {
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
      await truncateTables(knex)
    }
  )

  describe("User's invoices", (): void => {
    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!) {
              user(userId: $userId) {
                invoices {
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
            userId: user.id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.invoices?.edges).toHaveLength(20)
      expect(query.invoices?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.invoices?.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.invoices?.pageInfo.startCursor).toEqual(invoices[0].id)
      expect(query.invoices?.pageInfo.endCursor).toEqual(invoices[19].id)
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!) {
              user(userId: $userId) {
                invoices(first: 10) {
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
            userId: user.id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.invoices?.edges).toHaveLength(10)
      expect(query.invoices?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.invoices?.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.invoices?.pageInfo.startCursor).toEqual(invoices[0].id)
      expect(query.invoices?.pageInfo.endCursor).toEqual(invoices[9].id)
    })

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!, $after: String!) {
              user(userId: $userId) {
                invoices(after: $after) {
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
            userId: user.id,
            after: invoices[19].id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.invoices?.edges).toHaveLength(20)
      expect(query.invoices?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.invoices?.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.invoices?.pageInfo.startCursor).toEqual(invoices[20].id)
      expect(query.invoices?.pageInfo.endCursor).toEqual(invoices[39].id)
    })

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query User($userId: String!, $after: String!) {
              user(userId: $userId) {
                invoices(after: $after, first: 10) {
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
            userId: user.id,
            after: invoices[44].id
          }
        })
        .then(
          (query): User => {
            if (query.data) {
              return query.data.user
            } else {
              throw new Error('Data was empty')
            }
          }
        )
      expect(query.invoices?.edges).toHaveLength(5)
      expect(query.invoices?.pageInfo.hasNextPage).toBeFalsy()
      expect(query.invoices?.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.invoices?.pageInfo.startCursor).toEqual(invoices[45].id)
      expect(query.invoices?.pageInfo.endCursor).toEqual(invoices[49].id)
    })
  })
})
