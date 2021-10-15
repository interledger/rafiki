import {
  ResolversTypes,
  InvoiceConnectionResolvers,
  AccountResolvers
} from '../generated/graphql'
import { Invoice } from '../../invoice/model'
import { ApolloContext } from '../../app'

export const getAccountInvoices: AccountResolvers<ApolloContext>['invoices'] = async (
  parent,
  args,
  ctx
): ResolversTypes['InvoiceConnection'] => {
  if (!parent.id) throw new Error('missing account id')
  const invoiceService = await ctx.container.use('invoiceService')
  const invoices = await invoiceService.getAccountInvoicesPage(parent.id, args)

  return {
    edges: invoices.map((invoice: Invoice) => ({
      cursor: invoice.id,
      node: {
        ...invoice,
        expiresAt: invoice.expiresAt?.toISOString()
      }
    }))
  }
}

export const getPageInfo: InvoiceConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = await ctx.container.use('logger')
  const invoiceService = await ctx.container.use('invoiceService')

  logger.info({ edges: parent.edges }, 'getPageInfo parent edges')

  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  const firstInvoice = await invoiceService.get(edges[0].node.id)

  let hasNextPageInvoices, hasPreviousPageInvoices
  try {
    hasNextPageInvoices = await invoiceService.getAccountInvoicesPage(
      firstInvoice.accountId,
      {
        after: lastEdge,
        first: 1
      }
    )
  } catch (e) {
    hasNextPageInvoices = []
  }
  try {
    hasPreviousPageInvoices = await invoiceService.getAccountInvoicesPage(
      firstInvoice.accountId,
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
