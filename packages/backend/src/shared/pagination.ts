import { PaginationArgs } from '@interledger/open-payments'

import { BaseModel, PageInfo, Pagination, SortOrder } from './baseModel'

export function parsePaginationQueryParameters({
  'wallet-address': walletAddress,
  first,
  last,
  cursor
}: PaginationArgs): Pagination {
  return {
    walletAddress,
    first,
    last,
    before: last ? cursor : undefined,
    after: cursor && !last ? cursor : undefined
  }
}

type GetPageInfoArgs<T extends BaseModel> = {
  getPage: (pagination: Pagination, sortOrder?: SortOrder) => Promise<T[]>
  page: T[]
  walletAddress?: string
  sortOrder?: SortOrder
}

export async function getPageInfo<T extends BaseModel>({
  getPage,
  page,
  walletAddress,
  sortOrder
}: GetPageInfoArgs<T>): Promise<PageInfo> {
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
        walletAddress,
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
        walletAddress,
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
