import { BaseModel, PageInfo, Pagination } from './baseModel'

export function parsePaginationQueryParameters(
  first?: string | string[],
  last?: string | string[],
  cursor?: string | string[]
): Pagination {
  if (
    (first !== undefined && typeof first !== 'string') ||
    (last !== undefined && typeof last !== 'string') ||
    (cursor !== undefined && typeof cursor !== 'string')
  ) {
    throw new Error('Query parameters are not strings')
  }
  if (first && last) {
    throw new Error('first and last provided. Only one allowed')
  }
  if (last && !cursor) {
    throw new Error('cursor needed for backwards pagination')
  }
  return {
    first: Number(first) || undefined,
    last: Number(last) || undefined,
    before: last ? cursor : undefined,
    after: cursor && !last ? cursor : undefined
  }
}

export async function getListPageInfo<T extends BaseModel>(
  getPage: (pagination: Pagination) => Promise<T[]>,
  page: T[],
  pagination?: Pagination
): Promise<PageInfo> {
  const pageInfo = await getPageInfo((pagination) => getPage(pagination), page)
  if (pagination?.last) {
    pageInfo.last = page.length
  } else {
    pageInfo.first = page.length
  }
  return pageInfo
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
