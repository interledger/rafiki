import { IncomingPayment } from '../open_payments/payment/incoming/model'
import { IncomingPaymentService } from '../open_payments/payment/incoming/service'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import { OutgoingPaymentService } from '../open_payments/payment/outgoing/service'
import { Quote } from '../open_payments/quote/model'
import { QuoteService } from '../open_payments/quote/service'
import { PageInfo, Pagination } from './baseModel'

type ListResult = {
  pagination: PageInfo
  result: unknown // (IncomingPaymentJSON | OutgoingPaymentJSON | QuoteJSON)[]
}

export async function list(
  service: IncomingPaymentService | OutgoingPaymentService | QuoteService,
  host: string,
  accountId: string,
  pagination?: Pagination
): Promise<ListResult> {
  const page = await service.getAccountPage(accountId, pagination)
  const pageInfo = await getPageInfo(service, page)
  if (pagination && pagination.last) {
    pageInfo.last = page.length
  } else {
    pageInfo.first = page.length
  }
  return {
    pagination: pageInfo,
    result: page.map((item: IncomingPayment | OutgoingPayment | Quote) => {
      return {
        ...item.toJSON(),
        accountId: `${host}/${accountId}`,
        id:
          item['receivedAmount'] !== undefined
            ? `${host}/${accountId}/incoming-payments/${item.id}`
            : item['sentAmount'] !== undefined
            ? `${host}/${accountId}/outgoing-payments/${item.id}`
            : `${host}/${accountId}/quotes/${item.id}`
      }
    })
  }
}

export async function getPageInfo(
  service: IncomingPaymentService | OutgoingPaymentService | QuoteService,
  page: (IncomingPayment | OutgoingPayment | Quote)[]
): Promise<PageInfo> {
  if (page.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }
  const firstId = page[0].id
  const lastId = page[page.length - 1].id

  const firstResource = await service.get(firstId)
  if (!firstResource) throw new Error('Resource not found')

  let hasNextPage, hasPreviousPage
  try {
    hasNextPage = await service.getAccountPage(firstResource.accountId, {
      after: lastId,
      first: 1
    })
  } catch (e) {
    hasNextPage = []
  }
  try {
    hasPreviousPage = await service.getAccountPage(firstResource.accountId, {
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
