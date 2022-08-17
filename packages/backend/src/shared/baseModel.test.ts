import { BaseModel, Pagination } from '../shared/baseModel'

interface PageTestsOptions<Type> {
  createModel: () => Promise<Type>
  getPage: (pagination: Pagination) => Promise<Type[]>
}

export const getPageTests = <Type extends BaseModel>({
  createModel,
  getPage
}: PageTestsOptions<Type>): void => {
  describe('Common BaseModel pagination', (): void => {
    let modelsCreated: Type[]

    beforeEach(async (): Promise<void> => {
      modelsCreated = []
      for (let i = 0; i < 40; i++) {
        modelsCreated.push(await createModel())
      }
    })

    test.each`
      pagination                   | expected                               | description
      ${undefined}                 | ${{ length: 20, first: 0, last: 19 }}  | ${'Defaults to fetching first 20 items'}
      ${{ first: 10 }}             | ${{ length: 10, first: 0, last: 9 }}   | ${'Can change forward pagination limit'}
      ${{ after: 19 }}             | ${{ length: 20, first: 20, last: 39 }} | ${'Can paginate forwards from a cursor'}
      ${{ first: 10, after: 9 }}   | ${{ length: 10, first: 10, last: 19 }} | ${'Can paginate forwards from a cursor with a limit'}
      ${{ before: 20 }}            | ${{ length: 20, first: 0, last: 19 }}  | ${'Can paginate backwards from a cursor'}
      ${{ last: 5, before: 10 }}   | ${{ length: 5, first: 5, last: 9 }}    | ${'Can paginate backwards from a cursor with a limit'}
      ${{ after: 19, before: 19 }} | ${{ length: 20, first: 20, last: 39 }} | ${'Providing before and after results in forward pagination'}
    `(
      '$description',
      async ({ pagination, expected }): Promise<void> => {
        if (pagination?.after) {
          pagination.after = modelsCreated[pagination.after].id
        }
        if (pagination?.before) {
          pagination.before = modelsCreated[pagination.before].id
        }
        const models = await getPage(pagination)
        expect(models).toHaveLength(expected.length)
        expect(models[0].id).toEqual(modelsCreated[expected.first].id)
        expect(models[expected.length - 1].id).toEqual(
          modelsCreated[expected.last].id
        )
      }
    )

    test.each`
      pagination        | expectedError                                 | description
      ${{ last: 10 }}   | ${"Can't paginate backwards from the start."} | ${"Can't change backward pagination limit on it's own."}
      ${{ first: -1 }}  | ${'Pagination index error'}                   | ${"Can't request less than 0"}
      ${{ first: 101 }} | ${'Pagination index error'}                   | ${"Can't request more than 100"}
    `(
      '$description',
      async ({ pagination, expectedError }): Promise<void> => {
        await expect(getPage(pagination)).rejects.toThrow(expectedError)
      }
    )

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const modelsForwards = await getPage(paginationForwards)
      const paginationBackwards = {
        last: 10,
        before: modelsCreated[10].id
      }
      const modelsBackwards = await getPage(paginationBackwards)
      expect(modelsForwards).toHaveLength(10)
      expect(modelsBackwards).toHaveLength(10)
      expect(modelsForwards).toEqual(modelsBackwards)
    })
  })
}

test.todo('test suite must contain at least one test')
