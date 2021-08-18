import { ResolversTypes, MutationResolvers } from '../generated/graphql'
import { CreditError } from '../../accounts/types'

export const extendCredit: MutationResolvers['extendCredit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['ExtendCreditMutationResponse'] => {
  const error = await ctx.accountsService.extendCredit(args.input)
  if (error) {
    switch (error) {
      case CreditError.InsufficientBalance:
        return {
          code: '403',
          message: 'Insufficient balance',
          success: false
        }
      case CreditError.SameAccounts:
        return {
          code: '400',
          message: 'Same accounts',
          success: false
        }
      case CreditError.UnknownAccount:
        return {
          code: '404',
          message: 'Unknown account',
          success: false
        }
      case CreditError.UnknownSubAccount:
        return {
          code: '404',
          message: 'Unknown sub-account',
          success: false
        }
      case CreditError.UnrelatedSubAccount:
        return {
          code: '400',
          message: 'Unrelated sub-account',
          success: false
        }
      default:
        throw new Error(`CreditError: ${error}`)
    }
  }
  return {
    code: '200',
    success: true,
    message: 'Extended credit'
  }
}

export const revokeCredit: MutationResolvers['revokeCredit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['RevokeCreditMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const utilizeCredit: MutationResolvers['utilizeCredit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UtilizeCreditMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}

export const settleDebt: MutationResolvers['settleDebt'] = async (
  parent,
  args,
  ctx
): ResolversTypes['SettleDebtMutationResponse'] => {
  // TODO:
  console.log(ctx) // temporary to pass linting
  return {}
}
