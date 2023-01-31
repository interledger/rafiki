import { faker } from '@faker-js/faker'
import * as httpMocks from 'node-mocks-http'
import { AccessAction } from 'open-payments'
import { v4 as uuid } from 'uuid'

import {
  PaymentPointer,
  PaymentPointerSubresource,
  GetOptions,
  ListOptions
} from './model'
import { Grant } from '../auth/middleware'
import { PaymentPointerContext, ReadContext, ListContext } from '../../app'
import { getPageTests } from '../../shared/baseModel.test'
import { createContext } from '../../tests/context'

export interface SetupOptions {
  reqOpts: httpMocks.RequestOptions
  params?: Record<string, string>
  paymentPointer: PaymentPointer
  grant?: Grant
  client?: string
  accessAction?: AccessAction
}

export const setup = <T extends PaymentPointerContext>(
  options: SetupOptions
): T => {
  const ctx = createContext<T>(
    {
      ...options.reqOpts,
      headers: Object.assign(
        { Accept: 'application/json', 'Content-Type': 'application/json' },
        options.reqOpts.headers
      )
    },
    options.params
  )
  ctx.paymentPointer = options.paymentPointer
  ctx.grant = options.grant
  ctx.client = options.client
  ctx.accessAction = options.accessAction
  return ctx
}

interface TestGetOptions extends GetOptions {
  paymentPointerId: NonNullable<GetOptions['paymentPointerId']>
}

interface BaseTestsOptions<M> {
  createModel: (options: { client?: string }) => Promise<M>
  testGet: (options: TestGetOptions, expectedMatch?: M) => void
  testList?: (options: ListOptions, expectedMatch?: M) => void
}

const baseGetTests = <M extends PaymentPointerSubresource>({
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
    withClient | description
    ${true}    | ${'with client'}
    ${false}   | ${'without client'}
  `(
    'Common PaymentPointerSubresource get/getPaymentPointerPage ($description)',
    ({ withClient }): void => {
      const resourceClient = faker.internet.url()

      describe.each`
        client                  | match    | description
        ${resourceClient}       | ${true}  | ${GetOption.Matching}
        ${faker.internet.url()} | ${false} | ${GetOption.Conflicting}
        ${undefined}            | ${true}  | ${GetOption.Unspecified}
      `('$description client', ({ client, match, description }): void => {
        // Do not test matching client if model has no client
        if (withClient || description !== GetOption.Matching) {
          let model: M

          // This beforeEach needs to be inside the above if statement to avoid:
          // Invalid: beforeEach() may not be used in a describe block containing no tests.
          beforeEach(async (): Promise<void> => {
            model = await createModel({
              client: withClient ? resourceClient : undefined
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
                  paymentPointerId = ''
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
                    client,
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
                    client
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
  createModel,
  get,
  list
}: TestsOptions<M>): void => {
  baseGetTests({
    createModel,
    testGet: (options, expectedMatch) =>
      expect(get(options)).resolves.toEqual(expectedMatch),
    // tests paymentPointerId / client filtering
    testList: (options, expectedMatch) =>
      expect(list(options)).resolves.toEqual([expectedMatch])
  })

  // tests pagination
  let paymentPointerId: string
  getPageTests({
    createModel: async () => {
      const model = await createModel({})
      paymentPointerId = model.paymentPointerId
      return model
    },
    getPage: (pagination) =>
      list({
        paymentPointerId,
        pagination
      })
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
  getPaymentPointer,
  createModel,
  get,
  getBody,
  list,
  urlPath
}: RouteTestsOptions<M>): void => {
  const testList = async (
    { paymentPointerId, client }: ListOptions,
    expectedMatch?: M
  ) => {
    const paymentPointer = await getPaymentPointer()
    paymentPointer.id = paymentPointerId
    const ctx = setup<ListContext>({
      reqOpts: {
        headers: { Accept: 'application/json' },
        method: 'GET',
        url: urlPath
      },
      paymentPointer,
      client,
      accessAction: client ? AccessAction.List : AccessAction.ListAll
    })
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    await expect(list!(ctx)).resolves.toBeUndefined()
    if (expectedMatch) {
      // TODO: https://github.com/interledger/open-payments/issues/191
      expect(ctx.response).toSatisfyApiSpec()
    }
    expect(ctx.body).toEqual({
      result: expectedMatch ? [await getBody(expectedMatch, true)] : [],
      pagination: {
        hasPreviousPage: false,
        hasNextPage: false,
        startCursor: expectedMatch?.id,
        endCursor: expectedMatch?.id
      }
    })
  }

  baseGetTests({
    createModel,
    testGet: async ({ id, paymentPointerId, client }, expectedMatch) => {
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
        client,
        accessAction: client ? AccessAction.Read : AccessAction.ReadAll
      })
      if (expectedMatch) {
        await expect(get(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.body).toEqual(await getBody(expectedMatch))
      } else {
        await expect(get(ctx)).rejects.toMatchObject({
          status: 404,
          message: 'Not Found'
        })
      }
    },
    // tests paymentPointerId / client filtering
    testList: list && testList
  })

  if (list) {
    describe('Common list route pagination', (): void => {
      let models: M[]

      beforeEach(async (): Promise<void> => {
        models = []
        for (let i = 0; i < 3; i++) {
          models.push(await createModel({}))
        }
      })

      test.each`
        query            | cursorIndex | pagination                                        | startIndex | endIndex | description
        ${{}}            | ${-1}       | ${{ hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'no pagination parameters'}
        ${{ first: 2 }}  | ${-1}       | ${{ hasPreviousPage: false, hasNextPage: true }}  | ${0}       | ${1}     | ${'only `first`'}
        ${{ first: 10 }} | ${0}        | ${{ hasPreviousPage: true, hasNextPage: false }}  | ${1}       | ${2}     | ${'`first` plus `cursor`'}
        ${{ last: 10 }}  | ${2}        | ${{ hasPreviousPage: false, hasNextPage: true }}  | ${0}       | ${1}     | ${'`last` plus `cursor`'}
      `(
        'returns 200 on $description',
        async ({
          query,
          cursorIndex,
          pagination,
          startIndex,
          endIndex
        }): Promise<void> => {
          const cursor = models[cursorIndex]?.id
          if (cursor) {
            query['cursor'] = cursor
          }
          pagination['startCursor'] = models[startIndex].id
          pagination['endCursor'] = models[endIndex].id
          const ctx = setup<ListContext>({
            reqOpts: {
              headers: { Accept: 'application/json' },
              method: 'GET',
              query,
              url: urlPath
            },
            paymentPointer: await getPaymentPointer(),
            accessAction: AccessAction.ListAll
          })
          await expect(list(ctx)).resolves.toBeUndefined()
          expect(ctx.response).toSatisfyApiSpec()
          expect(ctx.body).toEqual({
            pagination,
            result: await Promise.all(
              models
                .slice(startIndex, endIndex + 1)
                .map(async (model) => await getBody(model, true))
            )
          })
        }
      )
    })
  }
}

test.todo('test suite must contain at least one test')
