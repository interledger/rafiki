import {
  QueryResolvers,
  ResolversTypes,
  MutationResolvers,
  DepositsConnectionResolvers
} from '../generated/graphql'
import { DepositError, isDepositError } from '../../deposit/service'

export const getDeposit: QueryResolvers['deposit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['Deposit'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const createDeposit: MutationResolvers['createDeposit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['CreateDepositMutationResponse'] => {
  try {
    const depositService = await ctx.container.use('depositService')
    const depositOrError = await depositService.create({
      ...args.input
    })
    if (isDepositError(depositOrError)) {
      switch (depositOrError) {
        case DepositError.DepositExists:
          return {
            code: '409',
            message: 'Deposit exists',
            success: false
          }
        case DepositError.InvalidId:
          return {
            code: '400',
            message: 'Invalid id',
            success: false
          }
        case DepositError.UnknownAccount:
          return {
            code: '404',
            message: 'Unknown ILP account',
            success: false
          }
        default:
          throw new Error(`DepositError: ${depositOrError}`)
      }
    }
    return {
      code: '200',
      success: true,
      message: 'Created Deposit',
      deposit: depositOrError
    }
  } catch (error) {
    ctx.logger.error('error creating deposit', {
      deposit: args.input,
      error
    })
    return {
      code: '400',
      message: 'Error trying to create deposit',
      success: false
    }
  }
}

export const getDepositsConnectionPageInfo: DepositsConnectionResolvers['pageInfo'] = async (
  parent,
  args,
  ctx
): ResolversTypes['PageInfo'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}
