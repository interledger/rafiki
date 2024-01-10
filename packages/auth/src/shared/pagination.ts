import { BaseModel, PageInfo, Pagination, SortOrder } from './baseModel'

export async function getPageInfo<T extends BaseModel>(
  getPage: (pagination: Pagination, sortOrder?: SortOrder) => Promise<T[]>,
  page: T[],
  sortOrder?: SortOrder
): Promise<PageInfo> {
  if (page.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }
  const firstId = page[0].id
  const lastId = page[page.length - 1].id

  let hasNextPage, hasPreviousPage

  try {
    hasNextPage = await getPage(
      {
        after: lastId,
        first: 1
      },
      sortOrder
    )
  } catch (e) {
    hasNextPage = []
  }
  try {
    hasPreviousPage = await getPage(
      {
        before: firstId,
        last: 1
      },
      sortOrder
    )
  } catch (e) {
    hasPreviousPage = []
  }

  return {
    endCursor: lastId,
    hasNextPage: hasNextPage.length == 1,
    hasPreviousPage: hasPreviousPage.length == 1,
    startCursor: firstId
  }
}
