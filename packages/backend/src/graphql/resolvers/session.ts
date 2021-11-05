import { isSessionKeyError, SessionKeyError } from '../../sessionKey/errors'
import { ResolversTypes, MutationResolvers } from '../generated/graphql'

export const refreshSession: MutationResolvers['refreshSession'] = async (
  parent,
  args,
  ctx
): ResolversTypes['RefreshSessionMutationResponse'] => {
  try {
    const sessionKeyService = await ctx.container.use('sessionKeyService')
    const sessionOrError = await sessionKeyService.refresh(args.input)
    if (isSessionKeyError(sessionOrError)) {
      switch (sessionOrError) {
        case SessionKeyError.UnknownSession:
          return {
            code: '404',
            message: 'Session not found.',
            success: false
          }
        case SessionKeyError.SessionExpired:
          return {
            code: '401',
            message: 'Session expired.',
            success: false
          }
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Refreshed Session',
      session: sessionOrError
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
): ResolversTypes['RevokeSessionMutationResponse'] => {
  try {
    const sessionKeyService = await ctx.container.use('sessionKeyService')
    await sessionKeyService.revoke(args.input)
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
