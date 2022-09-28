import { v4 as uuid } from 'uuid'

import { PaymentPointerSubresource, GetOptions } from './model'
import { Grant } from '../auth/grant'

interface TestsOptions<M> {
  createGrant: (options: { clientId: string }) => Promise<Grant>
  createModel: (options: { grant?: Grant }) => Promise<M>
  get: (options: GetOptions) => Promise<M | undefined>
}

export const getTests = <M extends PaymentPointerSubresource>({
  createGrant,
  createModel,
  get
}: TestsOptions<M>): void => {
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
                  await expect(
                    get({
                      id,
                      clientId,
                      paymentPointerId
                    })
                  ).resolves.toEqual(match ? model : undefined)
                })
              }
            )
          })
        }
      })
    }
  )
}

test.todo('test suite must contain at least one test')
