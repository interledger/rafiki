import { BaseModel, PageInfo, Pagination } from './baseModel'

export function parsePaginationQueryParameters(
  first?: number,
  last?: number,
  cursor?: string
): Pagination {
  if (first && last) {
    throw new Error('first and last provided. Only one allowed')
  }
  if (last && !cursor) {
    throw new Error('cursor needed for backwards pagination')
  }
  return {
    first,
    last,
    before: last ? cursor : undefined,
    after: cursor && !last ? cursor : undefined
  }
}

export async function getPageInfo<T extends BaseModel>(
  getPage: (pagination: Pagination) => Promise<T[]>,
  page: T[]
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
    hasNextPage = await getPage({
      after: lastId,
      first: 1
    })
  } catch (e) {
    hasNextPage = []
  }
  try {
    hasPreviousPage = await getPage({
      before: firstId,
      last: 1
    })
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
