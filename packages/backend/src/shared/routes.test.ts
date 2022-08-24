import * as httpMocks from 'node-mocks-http'
import { AppContext, ListContext } from '../app'
import { Grant } from '../open_payments/auth/grant'
import { createContext } from '../tests/context'

interface BaseResponse {
  id: string
}

export const setup = <T extends AppContext>(
  reqOpts: httpMocks.RequestOptions,
  params: Record<string, string>,
  grant?: Grant
): T => {
  const ctx = createContext<T>(
    {
      ...reqOpts,
      headers: Object.assign(
        { Accept: 'application/json', 'Content-Type': 'application/json' },
        reqOpts.headers
      )
    },
    params
  )
  if (reqOpts.body !== undefined) {
    ctx.request.body = reqOpts.body
  }
  if (grant) ctx.grant = grant
  return ctx
}

interface ListTestsOptions<Type> {
  getPaymentPointerId: () => string
  getGrant: () => Grant | undefined
  getUrl: () => string
  createItem: (index: number) => Promise<Type>
  list: (ctx: ListContext) => Promise<void>
}

export const listTests = <Type extends BaseResponse>({
  getPaymentPointerId,
  getGrant,
  getUrl,
  createItem,
  list
}: ListTestsOptions<Type>): void => {
  describe('Common list route pagination', (): void => {
    let items: Type[]

    const getCursor = (index: number) => items[index].id.split('/').pop()

    beforeEach(async (): Promise<void> => {
      items = []
      for (let i = 0; i < 3; i++) {
        items.push(await createItem(i))
      }
    })

    test.each`
      query            | cursorIndex | pagination                                        | startIndex | endIndex | description
      ${{}}            | ${-1}       | ${{ hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'no pagination parameters'}
      ${{ first: 10 }} | ${-1}       | ${{ hasPreviousPage: false, hasNextPage: false }} | ${0}       | ${2}     | ${'only `first`'}
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
        const cursor = items[cursorIndex] ? getCursor(cursorIndex) : undefined
        if (cursor) {
          query['cursor'] = cursor
        }
        pagination['startCursor'] = getCursor(startIndex)
        pagination['endCursor'] = getCursor(endIndex)
        const ctx = setup<ListContext>(
          {
            headers: { Accept: 'application/json' },
            method: 'GET',
            query,
            url: getUrl()
          },
          { accountId: getPaymentPointerId() },
          getGrant()
        )
        await expect(list(ctx)).resolves.toBeUndefined()
        expect(ctx.response).toSatisfyApiSpec()
        expect(ctx.body).toEqual({
          pagination,
          result: items.slice(startIndex, endIndex + 1)
        })
      }
    )
  })
}

test.todo('test suite must contain at least one test')
