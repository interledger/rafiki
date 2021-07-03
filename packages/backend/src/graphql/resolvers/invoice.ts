import {
  ResolversTypes,
  InvoiceConnectionResolvers,
  UserResolvers
} from '../generated/graphql'
import { Invoice } from '../../invoice/model'
import { toCursor } from '../../invoice/service'

export const getUserInvoices: UserResolvers['invoices'] = async (
  parent,
  args,
  ctx
): ResolversTypes['InvoiceConnection'] => {
  const invoiceService = ctx.container.use('invoiceService')
  const invoices = invoiceService.getUserInvoicesPage(ctx.userId, args)

  return {
    edges: invoices.map((invoice: Invoice) => ({
      cursor: toCursor(invoice.createdAt, invoice.id),
      node: invoice // May need to sanitise the db invoice.
    }))
  }
}

export const getPageInfo: InvoiceConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = ctx.container.use('logger')
  const invoiceService = ctx.container.use('invoiceService')

  logger.info(parent.edges, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null && typeof edges == 'undefined') return {}

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const hasNextPageInvoices = invoiceService.getUserInvoicesPage(ctx.userId, {
    after: lastEdge,
    first: 1
  })
  const hasPreviousPageInvoices = invoiceService.getUserInvoicesPage(
    ctx.userId,
    {
      before: firstEdge,
      last: 1
    }
  )
  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageInvoices.length == 1,
    hasPreviousPage: hasPreviousPageInvoices.length == 1,
    startCursor: firstEdge
  }
}
