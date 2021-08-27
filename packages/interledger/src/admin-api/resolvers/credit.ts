import {
  CreditError as CreditErrorResp,
  ResolversTypes,
  MutationResolvers
} from '../generated/graphql'
import { CreditError } from '../../accounts/types'

export const extendCredit: MutationResolvers['extendCredit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['ExtendCreditMutationResponse'] => {
  const error = await ctx.accountsService.extendCredit(args.input)
  if (error) {
    return errorToResponse[error]
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
  const error = await ctx.accountsService.revokeCredit(args.input)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Revoked credit'
  }
}

export const utilizeCredit: MutationResolvers['utilizeCredit'] = async (
  parent,
  args,
  ctx
): ResolversTypes['UtilizeCreditMutationResponse'] => {
  const error = await ctx.accountsService.utilizeCredit(args.input)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Utilized credit'
  }
}

export const settleDebt: MutationResolvers['settleDebt'] = async (
  parent,
  args,
  ctx
): ResolversTypes['SettleDebtMutationResponse'] => {
  const error = await ctx.accountsService.settleDebt(args.input)
  if (error) {
    return errorToResponse[error]
  }
  return {
    code: '200',
    success: true,
    message: 'Settled debt'
  }
}

const errorToResponse: {
  [key in CreditError]: {
    code: string
    message: string
    success: boolean
    error: CreditErrorResp
  }
} = {
  [CreditError.InsufficientBalance]: {
    code: '403',
    message: 'Insufficient balance',
    success: false,
    error: CreditErrorResp.InsufficientBalance
  },
  [CreditError.InsufficientCredit]: {
    code: '403',
    message: 'Insufficient credit',
    success: false,
    error: CreditErrorResp.InsufficientCredit
  },
  [CreditError.InsufficientDebt]: {
    code: '403',
    message: 'Insufficient debt',
    success: false,
    error: CreditErrorResp.InsufficientDebt
  },
  [CreditError.SameAccounts]: {
    code: '400',
    message: 'Same accounts',
    success: false,
    error: CreditErrorResp.SameAccounts
  },
  [CreditError.UnknownAccount]: {
    code: '404',
    message: 'Unknown account',
    success: false,
    error: CreditErrorResp.UnknownAccount
  },
  [CreditError.UnknownSubAccount]: {
    code: '404',
    message: 'Unknown sub-account',
    success: false,
    error: CreditErrorResp.UnknownSubAccount
  },
  [CreditError.UnrelatedSubAccount]: {
    code: '400',
    message: 'Unrelated sub-account',
    success: false,
    error: CreditErrorResp.UnrelatedSubAccount
  }
}
