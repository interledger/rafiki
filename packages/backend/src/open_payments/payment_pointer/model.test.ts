import { v4 as uuid } from 'uuid'

import {
  PaymentPointer,
  PaymentPointerSubresource,
  GetOptions,
  ListOptions
} from './model'
import { Grant } from '../auth/grant'
import { ReadContext, ListContext } from '../../app'
import { setup } from '../../shared/routes.test'

interface BaseTestsOptions<M> {
  createGrant: (options: { clientId: string }) => Promise<Grant>
  createModel: (options: { grant?: Grant }) => Promise<M>
  testGet: (options: GetOptions, expectedMatch?: M) => void
  testList?: (options: ListOptions, expectedMatch?: M) => void
}

const baseGetTests = <M extends PaymentPointerSubresource>({
  createGrant,
  createModel,
  testGet,
  testList
}: BaseTestsOptions<M>): void => {
  enum GetOption {
    Matching = 'matching',
    Conflicting = 'conflicting',
    Unspecified = 'unspecified'
  }

  describe.each`
    withGrant | description
    ${true}   | ${'with grant'}
    ${false}  | ${'without grant'}
  `(
    'Common PaymentPointerSubresource get ($description)',
    ({ withGrant }): void => {
      const grantClientId = uuid()

      describe.each`
        clientId         | match    | description
        ${grantClientId} | ${true}  | ${GetOption.Matching}
        ${uuid()}        | ${false} | ${GetOption.Conflicting}
        ${undefined}     | ${true}  | ${GetOption.Unspecified}
      `('$description clientId', ({ clientId, match, description }): void => {
        // Do not test matching clientId if model has no grant
        if (withGrant || description !== GetOption.Matching) {
          let model: M

          // This beforeEach needs to be inside the above if statement to avoid:
          // Invalid: beforeEach() may not be used in a describe block containing no tests.
          beforeEach(async (): Promise<void> => {
            model = await createModel({
              grant: withGrant
                ? await createGrant({
                    clientId: grantClientId
                  })
                : undefined
            })
          })
          describe.each`
            match    | description
            ${match} | ${GetOption.Matching}
            ${false} | ${GetOption.Conflicting}
            ${match} | ${GetOption.Unspecified}
          `('$description paymentPointerId', ({ match, description }): void => {
            let paymentPointerId: string
            beforeEach((): void => {
              switch (description) {
                case GetOption.Matching:
                  paymentPointerId = model.paymentPointerId
                  break
                case GetOption.Conflicting:
                  paymentPointerId = uuid()
                  break
                case GetOption.Unspecified:
                  paymentPointerId = undefined
                  break
              }
            })
            describe.each`
              match    | description
              ${match} | ${GetOption.Matching}
              ${false} | ${GetOption.Conflicting}
            `('$description id', ({ match, description }): void => {
              let id: string
              beforeEach((): void => {
                id = description === GetOption.Matching ? model.id : uuid()
              })

              test(`${
                match ? '' : 'cannot '
              }get a model`, async (): Promise<void> => {
                await testGet(
                  {
                    id,
                    clientId,
                    paymentPointerId
                  },
                  match ? model : undefined
                )
              })
            })
            test(`${
              match ? '' : 'cannot '
            }list model`, async (): Promise<void> => {
              if (testList && paymentPointerId) {
                await testList(
                  {
                    paymentPointerId,
                    clientId
                  },
                  match ? model : undefined
                )
              }
            })
          })
        }
      })
    }
  )
}

type TestsOptions<M> = Omit<BaseTestsOptions<M>, 'testGet' | 'testList'> & {
  get: (options: GetOptions) => Promise<M | undefined>
  list: (options: ListOptions) => Promise<M[]>
}

export const getTests = <M extends PaymentPointerSubresource>({
  createGrant,
  createModel,
  get,
  list
}: TestsOptions<M>): void => {
  baseGetTests({
    createGrant,
    createModel,
    testGet: (options, expectedMatch) =>
      expect(get(options)).resolves.toEqual(expectedMatch),
    testList: (options, expectedMatch) =>
      expect(list(options)).resolves.toEqual([expectedMatch])
  })
}

type RouteTestsOptions<M> = Omit<
  BaseTestsOptions<M>,
  'testGet' | 'testList'
> & {
  getPaymentPointer: () => Promise<PaymentPointer>
  get: (ctx: ReadContext) => Promise<void>
  getBody: (model: M, list?: boolean) => Record<string, unknown>
  list?: (ctx: ListContext) => Promise<void>
  urlPath: string
}

export const getRouteTests = <M extends PaymentPointerSubresource>({
  createGrant,
  getPaymentPointer,
  createModel,
  get,
  getBody,
  list,
  urlPath
}: RouteTestsOptions<M>): void => {
  const testList = async ({ paymentPointerId, clientId }, expectedMatch) => {
    const paymentPointer = await getPaymentPointer()
    paymentPointer.id = paymentPointerId
    const ctx = setup<ListContext>({
      reqOpts: {
        headers: { Accept: 'application/json' },
        method: 'GET',
        url: urlPath
      },
      paymentPointer,
      clientId
    })
    await expect(list(ctx)).resolves.toBeUndefined()
    if (expectedMatch) {
      // TODO: https://github.com/interledger/open-payments/issues/191
      expect(ctx.response).toSatisfyApiSpec()
    }
    expect(ctx.body).toEqual({
      result: expectedMatch ? [getBody(expectedMatch, true)] : [],
      pagination: {
        hasPreviousPage: false,
        hasNextPage: false,
        startCursor: expectedMatch?.id,
        endCursor: expectedMatch?.id
      }
    })
  }

  baseGetTests({
    createGrant,
    createModel,
    testGet: async ({ id, paymentPointerId, clientId }, expectedMatch) => {
      const paymentPointer = await getPaymentPointer()
      paymentPointer.id = paymentPointerId
      const ctx = setup<ReadContext>({
        reqOpts: {
          headers: { Accept: 'application/json' },
          method: 'GET',
          url: `${urlPath}/${id}`
        },
        params: {
          id
        },
        paymentPointer,
        clientId
      })
      if (expectedMatch) {
        await expect(get(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.body).toEqual(getBody(expectedMatch))
      } else {
        await expect(get(ctx)).rejects.toMatchObject({
          status: 404,
          message: 'Not Found'
        })
      }
    },
    testList: list && testList
  })
}

test.todo('test suite must contain at least one test')
