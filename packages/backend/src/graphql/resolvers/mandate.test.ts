import assert from 'assert'
import { gql } from 'apollo-server-koa'
import Knex from 'knex'
import nock from 'nock'
import { v4 as uuid } from 'uuid'

import { createTestApp, TestContainer } from '../../tests/app'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../../app'
import { initIocContainer } from '../..'
import { Config } from '../../config/app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'
import { isCreateError, RevokeError } from '../../open_payments/mandate/errors'
import { Mandate } from '../../open_payments/mandate/model'
import { MandateService } from '../../open_payments/mandate/service'
import { AccountService } from '../../open_payments/account/service'
import { Account, RevokeMandateMutationResponse } from '../generated/graphql'

describe('Mandate Resolver', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let mandateService: MandateService
  let accountService: AccountService
  let knex: Knex
  const { code: assetCode } = randomAsset()
  const prices = {
    [assetCode]: 1.0
  }

  beforeAll(
    async (): Promise<void> => {
      Config.pricesUrl = 'https://test.prices'
      nock(Config.pricesUrl)
        .get('/')
        .reply(200, () => prices)
        .persist()
      deps = await initIocContainer(Config)
      appContainer = await createTestApp(deps)
      knex = await deps.use('knex')
      mandateService = await deps.use('mandateService')
      accountService = await deps.use('accountService')
    }
  )

  afterAll(
    async (): Promise<void> => {
      await truncateTables(knex)
      await appContainer.apolloClient.stop()
      await appContainer.shutdown()
    }
  )

  describe(`Mutation.revokeMandate`, (): void => {
    let mandateId: string

    beforeEach(
      async (): Promise<void> => {
        const assetScale = 2
        const accountId = (
          await accountService.create({
            asset: { code: assetCode, scale: assetScale }
          })
        ).id
        const mandate = await mandateService.create({
          accountId,
          amount: BigInt(123),
          assetCode,
          assetScale
        })
        assert.ok(!isCreateError(mandate))
        mandateId = mandate.id
      }
    )

    test('200', async (): Promise<void> => {
      const spy = jest.spyOn(mandateService, 'revoke')
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation RevokeMandate($mandateId: String!) {
              revokeMandate(mandateId: $mandateId) {
                code
                success
                message
                mandate {
                  id
                  revoked
                }
              }
            }
          `,
          variables: { mandateId }
        })
        .then(
          (query): RevokeMandateMutationResponse => query.data?.revokeMandate
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(mandateId)
      expect(query.code).toBe('200')
      expect(query.success).toBe(true)
      expect(query.message).toBe('')
      expect(query.mandate?.id).toBe(mandateId)
      expect(query.mandate?.revoked).toBe(true)
    })

    test.each`
      error                         | code     | message
      ${RevokeError.AlreadyExpired} | ${'409'} | ${'Mandate already expired'}
      ${RevokeError.AlreadyRevoked} | ${'409'} | ${'Mandate already revoked'}
      ${RevokeError.UnknownMandate} | ${'404'} | ${'Unknown mandate'}
    `(
      '$code - $error',
      async ({ error, message, code }): Promise<void> => {
        const spy = jest.spyOn(mandateService, 'revoke')
        if (error !== RevokeError.UnknownMandate) {
          spy.mockResolvedValueOnce(error)
        }
        const id = error === RevokeError.UnknownMandate ? uuid() : mandateId
        const query = await appContainer.apolloClient
          .query({
            query: gql`
              mutation RevokeMandate($mandateId: String!) {
                revokeMandate(mandateId: $mandateId) {
                  code
                  success
                  message
                  mandate {
                    id
                    revoked
                  }
                }
              }
            `,
            variables: {
              mandateId: id
            }
          })
          .then(
            (query): RevokeMandateMutationResponse => query.data?.revokeMandate
          )
        expect(spy).toHaveBeenCalledTimes(1)
        expect(spy).toHaveBeenCalledWith(id)
        expect(query.code).toBe(code)
        expect(query.success).toBe(false)
        expect(query.message).toBe(message)
        expect(query.mandate).toBeNull()
      }
    )

    test('500', async (): Promise<void> => {
      const spy = jest
        .spyOn(mandateService, 'revoke')
        .mockRejectedValueOnce(new Error('fail'))
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            mutation RevokeMandate($mandateId: String!) {
              revokeMandate(mandateId: $mandateId) {
                code
                success
                message
                mandate {
                  id
                  revoked
                }
              }
            }
          `,
          variables: { mandateId }
        })
        .then(
          (query): RevokeMandateMutationResponse => query.data?.revokeMandate
        )
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(mandateId)
      expect(query.code).toBe('500')
      expect(query.success).toBe(false)
      expect(query.message).toBe('fail')
      expect(query.mandate).toBeNull()
    })
  })

  describe('Account mandates', (): void => {
    let mandates: Mandate[]
    let accountId: string

    beforeAll(async (): Promise<void> => {
      await truncateTables(knex)
      const assetScale = 2
      accountId = (
        await accountService.create({
          asset: { code: assetCode, scale: assetScale }
        })
      ).id
      mandates = []
      for (let i = 0; i < 50; i++) {
        const mandate = await mandateService.create({
          accountId,
          amount: BigInt(123),
          assetCode,
          assetScale,
          startAt: new Date(Date.now() + 5_000),
          expiresAt: new Date(Date.now() + 30_000),
          interval: 'PT5S'
        })
        assert.ok(!isCreateError(mandate))
        mandates.push(mandate)
      }
    }, 10_000)

    test('pageInfo is correct on default query without params', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($id: String!) {
              account(id: $id) {
                mandates {
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
            id: accountId
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
      expect(query.mandates?.edges).toHaveLength(20)
      expect(query.mandates?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.mandates?.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.mandates?.pageInfo.startCursor).toEqual(mandates[0].id)
      expect(query.mandates?.pageInfo.endCursor).toEqual(mandates[19].id)
    })

    test('No mandates, but mandates requested', async (): Promise<void> => {
      const account = await accountService.create({
        asset: randomAsset()
      })
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($id: String!) {
              account(id: $id) {
                mandates {
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
            id: account.id
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
      expect(query.mandates?.edges).toHaveLength(0)
      expect(query.mandates?.pageInfo.hasNextPage).toBeFalsy()
      expect(query.mandates?.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.mandates?.pageInfo.startCursor).toBeNull()
      expect(query.mandates?.pageInfo.endCursor).toBeNull()
    })

    test('pageInfo is correct on pagination from start', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($id: String!) {
              account(id: $id) {
                mandates(first: 10) {
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
            id: accountId
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
      expect(query.mandates?.edges).toHaveLength(10)
      expect(query.mandates?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.mandates?.pageInfo.hasPreviousPage).toBeFalsy()
      expect(query.mandates?.pageInfo.startCursor).toEqual(mandates[0].id)
      expect(query.mandates?.pageInfo.endCursor).toEqual(mandates[9].id)
    })

    test('pageInfo is correct on pagination from middle', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($id: String!, $after: String!) {
              account(id: $id) {
                mandates(after: $after) {
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
            id: accountId,
            after: mandates[19].id
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
      expect(query.mandates?.edges).toHaveLength(20)
      expect(query.mandates?.pageInfo.hasNextPage).toBeTruthy()
      expect(query.mandates?.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.mandates?.pageInfo.startCursor).toEqual(mandates[20].id)
      expect(query.mandates?.pageInfo.endCursor).toEqual(mandates[39].id)
    })

    test('pageInfo is correct on pagination near end', async (): Promise<void> => {
      const query = await appContainer.apolloClient
        .query({
          query: gql`
            query Account($id: String!, $after: String!) {
              account(id: $id) {
                mandates(after: $after, first: 10) {
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
            id: accountId,
            after: mandates[44].id
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
      expect(query.mandates?.edges).toHaveLength(5)
      expect(query.mandates?.pageInfo.hasNextPage).toBeFalsy()
      expect(query.mandates?.pageInfo.hasPreviousPage).toBeTruthy()
      expect(query.mandates?.pageInfo.startCursor).toEqual(mandates[45].id)
      expect(query.mandates?.pageInfo.endCursor).toEqual(mandates[49].id)
    })
  })
})
