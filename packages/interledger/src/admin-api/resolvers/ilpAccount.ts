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
  AccountsService,
  CreateAccountError,
  IlpAccount,
  isCreateAccountError,
  isUpdateAccountError,
  UpdateAccountError
} from '../../accounts/types'

export const getIlpAccounts: QueryResolvers['ilpAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccountsConnection'] => {
  const accounts = await ctx.accountsService.getAccountsPage({
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
  const account = await ctx.accountsService.getAccount(args.id)
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
  try {
    const accountOrError = await ctx.accountsService.updateAccount(args.input)
    if (isUpdateAccountError(accountOrError)) {
      switch (accountOrError) {
        case UpdateAccountError.UnknownAccount:
          return {
            code: '404',
            message: 'Unknown ILP account',
            success: false
          }
        case UpdateAccountError.DuplicateIncomingToken:
          return {
            code: '409',
            message: 'Incoming token already exists',
            success: false
          }
        default:
          throw new Error(`UpdateAccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Updated ILP Account',
      ilpAccount: accountOrError
    }
  } catch (err) {
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
    const accountOrError = await ctx.accountsService.createAccount({
      superAccountId: args.superAccountId
    })
    if (isCreateAccountError(accountOrError)) {
      switch (accountOrError) {
        case CreateAccountError.UnknownSuperAccount:
          return {
            code: '404',
            message: 'Unknown super-account',
            success: false
          }
        default:
          throw new Error(`CreateAccountError: ${accountOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Created ILP Sub-Account',
      ilpAccount: accountOrError
    }
  } catch (err) {
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
  const balance = await ctx.accountsService.getAccountBalance(parent.id)
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
  const superAccount = await ctx.accountsService.getAccount(
    parent.superAccountId
  )
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
  const subAccounts = await ctx.accountsService.getAccountsPage({
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
    accountsService: ctx.accountsService,
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

  const firstSubAccount = await ctx.accountsService.getAccount(edges[0].node.id)

  if (!firstSubAccount.superAccountId) {
    throw new Error('No super-account')
  }
  return getPageInfo({
    accountsService: ctx.accountsService,
    edges,
    superAccountId: firstSubAccount.superAccountId
  })
}

const getPageInfo = async ({
  accountsService,
  edges,
  superAccountId
}: {
  accountsService: AccountsService
  edges: IlpAccountEdge[]
  superAccountId?: string
}): ResolversTypes['PageInfo'] => {
  const firstEdge = edges[0].cursor
  const lastEdge = edges[edges.length - 1].cursor

  let hasNextPageAccounts, hasPreviousPageAccounts
  try {
    hasNextPageAccounts = await accountsService.getAccountsPage({
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
    hasPreviousPageAccounts = await accountsService.getAccountsPage({
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
