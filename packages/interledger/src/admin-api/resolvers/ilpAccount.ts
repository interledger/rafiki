import {
  QueryResolvers,
  ResolversTypes,
  IlpAccountEdge,
  IlpAccountResolvers,
  MutationResolvers,
  IlpAccountsConnectionResolvers,
  SubAccountsConnectionResolvers
} from '../generated/graphql'
import {
  AccountService,
  AccountError,
  isAccountError,
  IlpAccount
} from '../../account/service'

export const getIlpAccounts: QueryResolvers['ilpAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccountsConnection'] => {
  const accounts = await ctx.accountService.getPage({
    pagination: args
  })
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
  const account = await ctx.accountService.get(args.id)
  if (!account) {
    throw new Error('No account')
  }
  return account
}

export const createIlpAccount: MutationResolvers['createIlpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateIlpAccountMutationResponse'] => {
  try {
    const accountOrError = await ctx.accountService.create(args.input)
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
      ilpAccount: accountOrError
    }
  } catch (error) {
    ctx.logger.error('error creating account', {
      options: args.input,
      error
    })
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
  try {
    const accountOrError = await ctx.accountService.update(args.input)
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
      ilpAccount: accountOrError
    }
  } catch (error) {
    ctx.logger.error('error updating account', {
      options: args.input,
      error
    })
    return {
      code: '400',
      message: 'Error trying to update account',
      success: false
    }
  }
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
  try {
    const accountOrError = await ctx.accountService.create({
      superAccountId: args.superAccountId
    })
    if (isAccountError(accountOrError)) {
      switch (accountOrError) {
        case AccountError.UnknownSuperAccount:
          return {
            code: '404',
            message: 'Unknown super-account',
            success: false
          }
        default:
          throw new Error(`AccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Created ILP Sub-Account',
      ilpAccount: accountOrError
    }
  } catch (error) {
    ctx.logger.error('error creating sub-account', {
      superAccountId: args.superAccountId,
      error
    })
    return {
      code: '400',
      message: 'Error trying to create sub-account',
      success: false
    }
  }
}

export const getBalance: IlpAccountResolvers['balance'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Balance'] => {
  const balance = await ctx.accountService.getBalance(parent.id)
  if (!balance) {
    throw new Error('No account')
  }
  return balance
}

export const getSuperAccount: IlpAccountResolvers['superAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccount'] => {
  if (!parent.superAccountId) {
    throw new Error('No super-account')
  }
  const superAccount = await ctx.accountService.get(parent.superAccountId)
  if (!superAccount) {
    throw new Error('No super-account')
  }
  return superAccount
}

export const getSubAccounts: IlpAccountResolvers['subAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['SubAccountsConnection'] => {
  const subAccounts = await ctx.accountService.getPage({
    pagination: args,
    superAccountId: parent.id
  })
  return {
    edges: subAccounts.map((subAccount: IlpAccount) => ({
      cursor: subAccount.id,
      node: subAccount
    }))
  }
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
  return getPageInfo({
    accountService: ctx.accountService,
    edges
  })
}

export const getSubAccountsConnectionPageInfo: SubAccountsConnectionResolvers['pageInfo'] = async (
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

  const firstSubAccount = await ctx.accountService.get(edges[0].node.id)

  if (!firstSubAccount.superAccountId) {
    throw new Error('No super-account')
  }
  return getPageInfo({
    accountService: ctx.accountService,
    edges,
    superAccountId: firstSubAccount.superAccountId
  })
}

const getPageInfo = async ({
  accountService,
  edges,
  superAccountId
}: {
  accountService: AccountService
  edges: IlpAccountEdge[]
  superAccountId?: string
}): ResolversTypes['PageInfo'] => {
  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPageAccounts, hasPreviousPageAccounts
  try {
    hasNextPageAccounts = await accountService.getPage({
      pagination: {
        after: lastEdge,
        first: 1
      },
      superAccountId
    })
  } catch (e) {
    hasNextPageAccounts = []
  }
  try {
    hasPreviousPageAccounts = await accountService.getPage({
      pagination: {
        before: firstEdge,
        last: 1
      },
      superAccountId
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
