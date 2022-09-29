import { v4 as uuid } from 'uuid'

import { PaymentPointer, PaymentPointerSubresource, GetOptions } from './model'
import { Grant } from '../auth/grant'
import { ReadContext } from '../../app'
import { setup } from '../../shared/routes.test'

interface BaseTestsOptions<M> {
  createGrant: (options: { clientId: string }) => Promise<Grant>
  createModel: (options: { grant?: Grant }) => Promise<M>
  testGet: (options: GetOptions, expectedMatch?: M) => void
}

const baseGetTests = <M extends PaymentPointerSubresource>({
  createGrant,
  createModel,
  testGet
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
          `('$description id', ({ match, description }): void => {
            let id: string
            beforeEach((): void => {
              id = description === GetOption.Matching ? model.id : uuid()
            })
            describe.each`
              match    | description
              ${match} | ${GetOption.Matching}
              ${false} | ${GetOption.Conflicting}
              ${match} | ${GetOption.Unspecified}
            `(
              '$description paymentPointerId',
              ({ match, description }): void => {
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
              }
            )
          })
        }
      })
    }
  )
}

type TestsOptions<M> = Omit<BaseTestsOptions<M>, 'testGet'> & {
  get: (options: GetOptions) => Promise<M | undefined>
}

export const getTests = <M extends PaymentPointerSubresource>({
  createGrant,
  createModel,
  get
}: TestsOptions<M>): void => {
  baseGetTests({
    createGrant,
    createModel,
    testGet: (options, expectedMatch) =>
      expect(get(options)).resolves.toEqual(expectedMatch)
  })
}

type RouteTestsOptions<M> = Omit<BaseTestsOptions<M>, 'testGet'> & {
  getPaymentPointer: () => Promise<PaymentPointer>
  getUrl: (id: string) => string
  get: (ctx: ReadContext) => Promise<void>
  getBody: (model: M) => Record<string, unknown>
}

export const getRouteTests = <M extends PaymentPointerSubresource>({
  createGrant,
  getPaymentPointer,
  createModel,
  get,
  getUrl,
  getBody
}: RouteTestsOptions<M>): void => {
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
          url: getUrl(id)
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
    }
  })
}

test.todo('test suite must contain at least one test')
