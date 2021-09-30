import {
  QueryResolvers,
  ResolversTypes,
  AccountEdge,
  AccountResolvers,
  MutationResolvers,
  AccountsConnectionResolvers,
  SubAccountsConnectionResolvers
} from '../generated/graphql'
import {
  AccountService,
  AccountError,
  isAccountError,
  Account
} from '../../account/service'

export const getAccounts: QueryResolvers['accounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['AccountsConnection'] => {
  const accountService = await ctx.container.use('accountService')
  const accounts = await accountService.getPage({
    pagination: args
  })
  return {
    edges: accounts.map((account: Account) => ({
      cursor: account.id,
      node: account
    }))
  }
}

export const getAccount: QueryResolvers['account'] = async (
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

export const createAccount: MutationResolvers['createAccount'] = async (
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

export const updateAccount: MutationResolvers['updateAccount'] = async (
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

export const deleteAccount: MutationResolvers['deleteAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['DeleteAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const createSubAccount: MutationResolvers['createSubAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateSubAccountMutationResponse'] => {
  try {
    const accountService = await ctx.container.use('accountService')
    const accountOrError = await accountService.create({
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
      account: accountOrError
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

export const getBalance: AccountResolvers['balance'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Balance'] => {
  const accountService = await ctx.container.use('accountService')
  const balance = await accountService.getBalance(parent.id)
  if (!balance) {
    throw new Error('No account')
  }
  return balance
}

export const getSuperAccount: AccountResolvers['superAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Account'] => {
  if (!parent.superAccountId) {
    throw new Error('No super-account')
  }
  const accountService = await ctx.container.use('accountService')
  const superAccount = await accountService.get(parent.superAccountId)
  if (!superAccount) {
    throw new Error('No super-account')
  }
  return superAccount
}

export const getSubAccounts: AccountResolvers['subAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['SubAccountsConnection'] => {
  const accountService = await ctx.container.use('accountService')
  const subAccounts = await accountService.getPage({
    pagination: args,
    superAccountId: parent.id
  })
  return {
    edges: subAccounts.map((subAccount: Account) => ({
      cursor: subAccount.id,
      node: subAccount
    }))
  }
}

export const getAccountsConnectionPageInfo: AccountsConnectionResolvers['pageInfo'] = async (
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

  const accountService = await ctx.container.use('accountService')
  const firstSubAccount = await accountService.get(edges[0].node.id)

  if (!firstSubAccount.superAccountId) {
    throw new Error('No super-account')
  }
  return getPageInfo({
    accountService,
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
  edges: AccountEdge[]
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
