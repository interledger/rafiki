import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { ApiKeyError, isApiKeyError } from '../../apiKey/errors'

export const createApiKey: MutationResolvers['createApiKey'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['CreateApiKeyMutationResponse']> => {
  try {
    const apiKeyService = await ctx.container.use('apiKeyService')
    const apiKey = await apiKeyService.create({ ...args.input })
    return {
      code: '200',
      success: true,
      message: 'Created Api Key',
      apiKey: {
        id: apiKey.id,
        accountId: apiKey.accountId,
        key: apiKey.key,
        createdAt: apiKey.createdAt.toISOString(),
        updatedAt: apiKey.updatedAt.toISOString()
      }
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error creating api key'
    )
    return {
      code: '400',
      message: 'Error trying to create api key',
      success: false
    }
  }
}

export const deleteAllApiKeys: MutationResolvers['deleteAllApiKeys'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['DeleteAllApiKeysMutationResponse']> => {
  try {
    const apiKeyService = await ctx.container.use('apiKeyService')
    await apiKeyService.deleteAll(args.input)
    return {
      code: '200',
      success: true,
      message:
        'Deleted all Api Keys for account with id=' + args.input?.accountId
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error deleting api keys'
    )
    return {
      code: '400',
      message: 'Error trying to delete all api keys',
      success: false
    }
  }
}

export const redeemApiKey: MutationResolvers['redeemApiKey'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['RedeemApiKeyMutationResponse']> => {
  try {
    const apiKeyService = await ctx.container.use('apiKeyService')
    const sessionKeyOrError = await apiKeyService.redeem(args.input)
    if (isApiKeyError(sessionKeyOrError)) {
      switch (sessionKeyOrError) {
        case ApiKeyError.UnknownApiKey:
          return {
            code: '404',
            message: 'Api key not found. accountId=' + args.input?.accountId,
            success: false
          }
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Redeemed API Key',
      session: sessionKeyOrError
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error redeeming API key'
    )
    return {
      code: '400',
      message: 'Error trying to redeem API key',
      success: false
    }
  }
}
