import {
  ResolversTypes,
  InvoiceConnectionResolvers,
  UserResolvers,
  InvoiceEdgeResolvers
} from '../generated/graphql'

export const getUserInvoices: UserResolvers['invoices'] = async (
  parent,
  args,
  ctx
): ResolversTypes['InvoiceConnection'] => {
  const logger = ctx.container.use('logger')
  logger.info(args, 'getUserInvoices args')
  // TODO: edges: generate node ids for edges.
  // TODO: PageInfo: generate partial PageInfo that can be derived from edges.
  return {}
}

export const getPageInfo: InvoiceConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const logger = ctx.container.use('logger')
  logger.info(args, 'getPageInfo args')
  // TODO: generate missing PageInfo that can't be derived from edges.
  return {}
}

export const getInvoiceEdges: InvoiceConnectionResolvers['edges'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['InvoiceEdge'][]> => {
  const logger = ctx.container.use('logger')
  logger.info(args, 'getInvoiceEdges args')
  // TODO: generate array of cursors that match edge ids in parent.
  return []
}

export const getInvoiceEdgeNode: InvoiceEdgeResolvers['node'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Invoice'] => {
  const logger = ctx.container.use('logger')
  logger.info(args, 'getInvoiceEdgeNode args')
  // TODO: return invoice
  return {}
}
