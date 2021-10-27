import {
  QueryResolvers,
  ResolversTypes,
  AccountEdge,
  AccountResolvers,
  AccountsConnectionResolvers
} from '../generated/graphql'
import { AccountService, Account } from '../../account/service'
import { ApolloContext } from '../../app'

export const getAccounts: QueryResolvers<ApolloContext>['accounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AccountsConnection'] => {
  const accountService = await ctx.container.use('accountService')
  const accounts = await accountService.getPage(args)
  return {
    edges: accounts.map((account: Account) => ({
      cursor: account.id,
      node: account
    }))
  }
}

export const getAccount: QueryResolvers<ApolloContext>['account'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  const accountService = await ctx.container.use('accountService')
  const account = await accountService.get(args.id)
  if (!account) {
    throw new Error('No account')
  }
  return account
}

export const getBalance: AccountResolvers<ApolloContext>['balance'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UInt64'] => {
  if (!parent.id) throw new Error('missing account id')
  const accountService = await ctx.container.use('accountService')
  const balance = await accountService.getBalance(parent.id)
  if (balance === undefined) {
    throw new Error('No account')
  }
  return balance
}

export const getAccountsConnectionPageInfo: AccountsConnectionResolvers<ApolloContext>['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  const edges = parent.edges
  if (edges == null || typeof edges == 'undefined' || edges.length == 0)
    return {
      hasPreviousPage: false,
      hasNextPage: false
    }
  return getPageInfo({
    accountService: await ctx.container.use('accountService'),
    edges
  })
}

const getPageInfo = async ({
  accountService,
  edges
}: {
  accountService: AccountService
  edges: AccountEdge[]
}): ResolversTypes['PageInfo'] => {
  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPageAccounts, hasPreviousPageAccounts
  try {
    hasNextPageAccounts = await accountService.getPage({
      after: lastEdge,
      first: 1
    })
  } catch (e) {
    hasNextPageAccounts = []
  }
  try {
    hasPreviousPageAccounts = await accountService.getPage({
      before: firstEdge,
      last: 1
    })
  } catch (e) {
    hasPreviousPageAccounts = []
  }

  return {
    endCursor: lastEdge,
    hasNextPage: hasNextPageAccounts.length == 1,
    hasPreviousPage: hasPreviousPageAccounts.length == 1,
    startCursor: firstEdge
  }
}
