import {
  ResolversTypes,
  InvoiceConnectionResolvers,
  UserResolvers
} from '../generated/graphql'
import { Invoice } from '../../invoice/model'

export const getUserInvoices: UserResolvers['invoices'] = async (
  parent,
  args,
  ctx
): ResolversTypes['InvoiceConnection'] => {
  const invoiceService = await ctx.container.use('invoiceService')
  const invoices = await invoiceService.getUserInvoicesPage(parent.id, args)

  return {
    edges: invoices.map((invoice: Invoice) => ({
      cursor: invoice.id,
      node: invoice
    }))
  }
}

export const getPageInfo: InvoiceConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = await ctx.container.use('logger')
  const invoiceService = await ctx.container.use('invoiceService')

  logger.info(parent.edges, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined') return {}

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstInvoice = await invoiceService.get(edges[0].node.id)

  let hasNextPageInvoices, hasPreviousPageInvoices
  try {
    hasNextPageInvoices = await invoiceService.getUserInvoicesPage(
      firstInvoice.userId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPageInvoices = []
  }
  try {
    hasPreviousPageInvoices = await invoiceService.getUserInvoicesPage(
      firstInvoice.userId,
      {
        before: firstEdge,
        last: 1
      }
    )
  } catch (e) {
    hasPreviousPageInvoices = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageInvoices.length == 1,
    hasPreviousPage: hasPreviousPageInvoices.length == 1,
    startCursor: firstEdge
  }
}
