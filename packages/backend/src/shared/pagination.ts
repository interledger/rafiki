import assert from 'assert'
import { IncomingPayment } from '../open_payments/payment/incoming/model'
import {
  IncomingPaymentService,
  ServiceDependencies as IncomingServiceDeps
} from '../open_payments/payment/incoming/service'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'
import {
  OutgoingPaymentService,
  ServiceDependencies as OutgoingServiceDeps
} from '../open_payments/payment/outgoing/service'
import { Quote } from '../open_payments/quote/model'
import {
  QuoteService,
  ServiceDependencies as QuoteServiceDeps
} from '../open_payments/quote/service'
import { PageInfo, Pagination } from './baseModel'

export enum Resource {
  incomingPayment = 'incomingPayment',
  outgoingPayment = 'outgoingPayment',
  quote = 'quote'
}

export async function getAccountPage(
  resource: Resource,
  deps: IncomingServiceDeps | OutgoingServiceDeps | QuoteServiceDeps,
  accountId: string,
  pagination?: Pagination
): Promise<(IncomingPayment | OutgoingPayment | Quote)[]> {
  let page
  let getAccounts
  let amount: string
  switch (resource) {
    case Resource.incomingPayment:
      page = await IncomingPayment.query(deps.knex)
        .getPage(pagination)
        .where({
          accountId: accountId
        })
        .withGraphFetched('asset')
      deps = deps as IncomingServiceDeps
      getAccounts = deps.accountingService.getAccountsTotalReceived
      amount = 'receivedAmount'
      break
    case Resource.outgoingPayment:
      page = await OutgoingPayment.query(deps.knex)
        .getPage(pagination)
        .where({
          accountId: accountId
        })
        .withGraphFetched('quote.asset')
      deps = deps as OutgoingServiceDeps
      getAccounts = deps.accountingService.getAccountsTotalSent
      amount = 'sentAmount'
      break
    default:
      page = await Quote.query(deps.knex)
        .getPage(pagination)
        .where({
          accountId: accountId
        })
        .withGraphFetched('asset')
      deps = deps as QuoteServiceDeps
  }

  if (resource === Resource.quote || page.length === 0) return page
  else {
    assert.ok(getAccounts)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    const amounts = await getAccounts(page.map((payment: any) => payment.id))
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
    return page.map((payment: any, i: number) => {
      try {
        payment[amount] = {
          value: BigInt(amounts[i]),
          assetCode: payment.asset.code,
          assetScale: payment.asset.scale
        }
      } catch (_) {
        deps.logger.error({ payment: payment.id }, 'account not found')
        throw new Error(
          `Underlying TB account not found, payment id: ${payment.id}`
        )
      }
      return payment
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
