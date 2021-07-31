import {
  QueryResolvers,
  ResolversTypes,
  IlpAccountResolvers,
  MutationResolvers,
  IlpAccountsConnectionResolvers
} from '../generated/graphql'

export const getIlpAccounts: QueryResolvers['ilpAccounts'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccountsConnection'] => {
  // TODO: get account edges from accounts service
  console.log(ctx) // temporary to pass linting
  return {
    edges: []
  }
}

export const getIlpAccount: QueryResolvers['ilpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['IlpAccount'] => {
  // TODO: get account all information from accounts service
  const account = await ctx.accountsService.getAccount(args.id)
  return {
    id: account.accountId
  }
}

export const createIlpAccount: MutationResolvers['createIlpAccount'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateIlpAccountMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
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
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}
