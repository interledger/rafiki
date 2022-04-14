import { ResolversTypes, MutationResolvers } from '../generated/graphql'

export const refreshSession: MutationResolvers['refreshSession'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['RefreshSessionMutationResponse']> => {
  try {
    const sessionService = await ctx.container.use('sessionService')
    const session = await sessionService.refresh(args.input.key)
    if (!session) {
      return {
        code: '401',
        message: 'Session not found.',
        success: false
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Refreshed Session',
      session: session
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error refreshing session'
    )
    return {
      code: '400',
      message: 'Error trying to refresh session',
      success: false
    }
  }
}

export const revokeSession: MutationResolvers['revokeSession'] = async (
  parent,
  args,
  ctx
): Promise<ResolversTypes['RevokeSessionMutationResponse']> => {
  try {
    const sessionKeyService = await ctx.container.use('sessionService')
    await sessionKeyService.revoke(args.input.key)
    return {
      code: '200',
      success: true,
      message: 'Revoked Session'
    }
  } catch (error) {
    ctx.logger.error(
      {
        options: args.input,
        error
      },
      'error revoking session'
    )
    return {
      code: '400',
      message: 'Error trying to revoke session',
      success: false
    }
  }
}
