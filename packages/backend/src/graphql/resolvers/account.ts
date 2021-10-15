import {
  QueryResolvers,
  ResolversTypes,
  AccountEdge,
  AccountResolvers,
  MutationResolvers,
  AccountsConnectionResolvers
} from '../generated/graphql'
import { AccountService, Account } from '../../account/service'
import { AccountError, isAccountError } from '../../account/errors'
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

export const createAccount: MutationResolvers<ApolloContext>['createAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateAccountMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const accountOrError = await accountService.create(args.input)
    if (isAccountError(accountOrError)) {
      switch (accountOrError) {
        case AccountError.DuplicateAccountId:
          return {
            code: '409',
            message: 'Account already exists',
            success: false
          }
        case AccountError.DuplicateIncomingToken:
          return {
            code: '409',
            message: 'Incoming token already exists',
            success: false
          }
        default:
          throw new Error(`AccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Created ILP Account',
      account: accountOrError
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error creating account'
    )
    return {
      code: '400',
      message: 'Error trying to create account',
      success: false
    }
  }
}

export const updateAccount: MutationResolvers<ApolloContext>['updateAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UpdateAccountMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const accountOrError = await accountService.update(args.input)
    if (isAccountError(accountOrError)) {
      switch (accountOrError) {
        case AccountError.UnknownAccount:
          return {
            code: '404',
            message: 'Unknown ILP account',
            success: false
          }
        case AccountError.DuplicateIncomingToken:
          return {
            code: '409',
            message: 'Incoming token already exists',
            success: false
          }
        default:
          throw new Error(`AccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Updated ILP Account',
      account: accountOrError
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error updating account'
    )
    return {
      code: '400',
      message: 'Error trying to update account',
      success: false
    }
  }
}

export const deleteAccount: MutationResolvers<ApolloContext>['deleteAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['DeleteAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
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
