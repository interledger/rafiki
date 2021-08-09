import {
  QueryResolvers,
  ResolversTypes,
  IlpAccountResolvers,
  MutationResolvers,
  IlpAccountsConnectionResolvers
} from '../generated/graphql'
import {
  CreateAccountError,
  IlpAccount,
  isCreateAccountError
} from '../../accounts/types'

export const getIlpAccounts: QueryResolvers['ilpAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccountsConnection'] => {
  const accounts = await ctx.accountsService.getAccountsPage(args)
  return {
    edges: accounts.map((account: IlpAccount) => ({
      cursor: account.id,
      node: account
    }))
  }
}

export const getIlpAccount: QueryResolvers['ilpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccount'] => {
  return await ctx.accountsService.getAccount(args.id)
}

export const createIlpAccount: MutationResolvers['createIlpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateIlpAccountMutationResponse'] => {
  try {
    const accountOrError = await ctx.accountsService.createAccount(args.input)
    if (isCreateAccountError(accountOrError)) {
      switch (accountOrError) {
        case CreateAccountError.DuplicateAccountId:
          return {
            code: '409',
            message: 'Account already exists',
            success: false
          }
        case CreateAccountError.DuplicateIncomingToken:
          return {
            code: '409',
            message: 'Incoming token already exists',
            success: false
          }
        default:
          throw new Error(`CreateAccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Created ILP Account',
      ilpAccount: accountOrError
    }
  } catch (err) {
    return {
      code: '400',
      message: 'Error trying to create account',
      success: false
    }
  }
}

export const updateIlpAccount: MutationResolvers['updateIlpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UpdateIlpAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const deleteIlpAccount: MutationResolvers['deleteIlpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['DeleteIlpAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const createIlpSubAccount: MutationResolvers['createIlpSubAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateIlpSubAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const getSuperAccount: IlpAccountResolvers['superAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccount'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const getSubAccounts: IlpAccountResolvers['subAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccountsConnection'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const getIlpAccountsConnectionPageInfo: IlpAccountsConnectionResolvers['pageInfo'] = async (
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

  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPageAccounts, hasPreviousPageAccounts
  try {
    hasNextPageAccounts = await ctx.accountsService.getAccountsPage({
      after: lastEdge,
      first: 1
    })
  } catch (e) {
    hasNextPageAccounts = []
  }
  try {
    hasPreviousPageAccounts = await ctx.accountsService.getAccountsPage({
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
