import {
  BalanceService,
  BalanceTransfer,
  CreateTransferError
} from '../balance/service'
import { IlpAccount as IlpAccountModel, SubAccount } from '../accounts/models'
import { BaseService } from '../shared/baseService'
import { BalanceTransferError, UnknownBalanceError } from '../shared/errors'

export interface CreditOptions {
  accountId: string
  subAccountId: string
  amount: bigint
}

export interface ExtendCreditOptions extends CreditOptions {
  autoApply?: boolean
}

export interface SettleDebtOptions extends CreditOptions {
  revolve?: boolean
}

export enum CreditError {
  SameAccounts = 'SameAccounts',
  UnknownAccount = 'UnknownAccount',
  UnrelatedSubAccount = 'UnrelatedSubAccount',
  UnknownSubAccount = 'UnknownSubAccount',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientCredit = 'InsufficientCredit',
  InsufficientDebt = 'InsufficientDebt'
}

export interface CreditService {
  extend(extendOptions: ExtendCreditOptions): Promise<void | CreditError>
  utilize(utilizeOptions: CreditOptions): Promise<void | CreditError>
  revoke(revokeOptions: CreditOptions): Promise<void | CreditError>
  settleDebt(settleOptions: SettleDebtOptions): Promise<void | CreditError>
}

interface ServiceDependencies extends BaseService {
  balanceService: BalanceService
}

export function createCreditService({
  logger,
  balanceService
}: ServiceDependencies): CreditService {
  const log = logger.child({
    service: 'CreditService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    balanceService
  }
  return {
    extend: (options) => extendCredit(deps, options),
    utilize: (options) => utilizeCredit(deps, options),
    revoke: (options) => revokeCredit(deps, options),
    settleDebt: (options) => settleDebt(deps, options)
  }
}

/**
 * Extends additional line of credit to sub-account from its super-account(s)
 *
 * @param {Object} options
 * @param {string} options.accountId - Account extending credit
 * @param {string} options.subAccountId - Sub-account to which credit is extended
 * @param {bigint} options.amount
 * @param {boolean} [options.autoApply] - Utilize credit and apply to sub-account's balance (default: false)
 */
async function extendCredit(
  deps: ServiceDependencies,
  { accountId, subAccountId, amount, autoApply }: ExtendCreditOptions
): Promise<void | CreditError> {
  const subAccount = await getAccountWithSuperAccounts(subAccountId)
  if (!subAccount) {
    return CreditError.UnknownSubAccount
  } else if (!subAccount.hasSuperAccount(accountId)) {
    if (accountId === subAccountId) {
      return CreditError.SameAccounts
    } else if (await IlpAccountModel.query().findById(accountId)) {
      return CreditError.UnrelatedSubAccount
    }
    return CreditError.UnknownAccount
  }
  const transfers: BalanceTransfer[] = []
  let account = subAccount as IlpAccountModel
  for (
    ;
    account.isSubAccount() && account.id !== accountId;
    account = account.superAccount
  ) {
    if (autoApply) {
      transfers.push(increaseDebt({ account, amount }))
    } else {
      transfers.push(increaseCredit({ account, amount }))
    }
  }
  if (autoApply) {
    transfers.push({
      sourceBalanceId: account.balanceId,
      destinationBalanceId: subAccount.balanceId,
      amount
    })
  }
  const err = await deps.balanceService.createTransfers(transfers)
  if (err) {
    if (
      autoApply &&
      err.index === transfers.length - 1 &&
      err.code === CreateTransferError.exceeds_credits
    ) {
      return CreditError.InsufficientBalance
    }
    throw new BalanceTransferError(err.code)
  }
}

/**
 * Utilizes line of credit to sub-account and applies to sub-account's balance
 *
 * @param {Object} options
 * @param {string} options.accountId - Account extending credit
 * @param {string} options.subAccountId - Sub-account to which credit is extended
 * @param {bigint} options.amount
 */
async function utilizeCredit(
  deps: ServiceDependencies,
  { accountId, subAccountId, amount }: CreditOptions
): Promise<void | CreditError> {
  const subAccount = await getAccountWithSuperAccounts(subAccountId)
  if (!subAccount) {
    return CreditError.UnknownSubAccount
  } else if (!subAccount.hasSuperAccount(accountId)) {
    if (accountId === subAccountId) {
      return CreditError.SameAccounts
    } else if (await IlpAccountModel.query().findById(accountId)) {
      return CreditError.UnrelatedSubAccount
    }
    return CreditError.UnknownAccount
  }
  const transfers: BalanceTransfer[] = []
  let account = subAccount as IlpAccountModel
  for (
    ;
    account.isSubAccount() && account.id !== accountId;
    account = account.superAccount
  ) {
    transfers.push(decreaseCredit({ account, amount }))
    transfers.push(increaseDebt({ account, amount }))
  }
  transfers.push({
    sourceBalanceId: account.balanceId,
    destinationBalanceId: subAccount.balanceId,
    amount
  })
  const err = await deps.balanceService.createTransfers(transfers)
  if (err) {
    if (err.code === CreateTransferError.exceeds_credits) {
      if (err.index === transfers.length - 1) {
        return CreditError.InsufficientBalance
      } else {
        return CreditError.InsufficientCredit
      }
    }
    throw new BalanceTransferError(err.code)
  }
}

/**
 * Reduces an existing line of credit available to the sub-account
 *
 * @param {Object} options
 * @param {string} options.accountId - Account revoking credit
 * @param {string} options.subAccountId - Sub-account to which credit is revoked
 * @param {bigint} options.amount
 */
async function revokeCredit(
  deps: ServiceDependencies,
  { accountId, subAccountId, amount }: CreditOptions
): Promise<void | CreditError> {
  const subAccount = await getAccountWithSuperAccounts(subAccountId)
  if (!subAccount) {
    return CreditError.UnknownSubAccount
  } else if (!subAccount.hasSuperAccount(accountId)) {
    if (accountId === subAccountId) {
      return CreditError.SameAccounts
    } else if (await IlpAccountModel.query().findById(accountId)) {
      return CreditError.UnrelatedSubAccount
    }
    return CreditError.UnknownAccount
  }
  const transfers: BalanceTransfer[] = []
  let account = subAccount as IlpAccountModel
  for (
    ;
    account.isSubAccount() && account.id !== accountId;
    account = account.superAccount
  ) {
    transfers.push(decreaseCredit({ account, amount }))
  }
  const err = await deps.balanceService.createTransfers(transfers)
  if (err) {
    if (err.code === CreateTransferError.exceeds_credits) {
      return CreditError.InsufficientCredit
    }
    throw new BalanceTransferError(err.code)
  }
}

/**
 * Collects debt from sub-account
 *
 * @param {Object} options
 * @param {string} options.accountId - Account collecting debt
 * @param {string} options.subAccountId - Sub-account settling debt
 * @param {bigint} options.amount
 * @param {boolean} [options.revolve] - Replenish the sub-account's line of credit commensurate with the debt settled (default: true)
 */
async function settleDebt(
  deps: ServiceDependencies,
  { accountId, subAccountId, amount, revolve }: SettleDebtOptions
): Promise<void | CreditError> {
  const subAccount = await getAccountWithSuperAccounts(subAccountId)
  if (!subAccount) {
    return CreditError.UnknownSubAccount
  } else if (!subAccount.hasSuperAccount(accountId)) {
    if (accountId === subAccountId) {
      return CreditError.SameAccounts
    } else if (await IlpAccountModel.query().findById(accountId)) {
      return CreditError.UnrelatedSubAccount
    }
    return CreditError.UnknownAccount
  }
  const transfers: BalanceTransfer[] = []
  let account = subAccount as IlpAccountModel
  for (
    ;
    account.isSubAccount() && account.id !== accountId;
    account = account.superAccount
  ) {
    transfers.push(decreaseDebt({ account, amount }))
    if (revolve !== false) {
      transfers.push(increaseCredit({ account, amount }))
    }
  }
  transfers.push({
    sourceBalanceId: subAccount.balanceId,
    destinationBalanceId: account.balanceId,
    amount
  })
  const err = await deps.balanceService.createTransfers(transfers)
  if (err) {
    if (err.code === CreateTransferError.exceeds_credits) {
      if (err.index === transfers.length - 1) {
        return CreditError.InsufficientBalance
      } else {
        return CreditError.InsufficientDebt
      }
    }
    throw new BalanceTransferError(err.code)
  }
}

async function getAccountWithSuperAccounts(
  accountId: string
): Promise<IlpAccountModel | undefined> {
  const account = await IlpAccountModel.query()
    .withGraphFetched(`superAccount.^`, {
      minimize: true
    })
    .findById(accountId)
  return account || undefined
}

function increaseCredit({
  account,
  amount
}: {
  account: SubAccount
  amount: bigint
}): BalanceTransfer {
  if (!account.creditBalanceId) {
    throw new UnknownBalanceError(account.id)
  } else if (!account.superAccount.creditExtendedBalanceId) {
    throw new UnknownBalanceError(account.superAccount.id)
  }
  return {
    sourceBalanceId: account.superAccount.creditExtendedBalanceId,
    destinationBalanceId: account.creditBalanceId,
    amount
  }
}

function decreaseCredit({
  account,
  amount
}: {
  account: SubAccount
  amount: bigint
}): BalanceTransfer {
  if (!account.creditBalanceId) {
    throw new UnknownBalanceError(account.id)
  } else if (!account.superAccount.creditExtendedBalanceId) {
    throw new UnknownBalanceError(account.superAccount.id)
  }
  return {
    sourceBalanceId: account.creditBalanceId,
    destinationBalanceId: account.superAccount.creditExtendedBalanceId,
    amount
  }
}

function increaseDebt({
  account,
  amount
}: {
  account: SubAccount
  amount: bigint
}): BalanceTransfer {
  if (!account.debtBalanceId) {
    throw new UnknownBalanceError(account.id)
  } else if (!account.superAccount.lentBalanceId) {
    throw new UnknownBalanceError(account.superAccount.id)
  }
  return {
    sourceBalanceId: account.superAccount.lentBalanceId,
    destinationBalanceId: account.debtBalanceId,
    amount
  }
}

function decreaseDebt({
  account,
  amount
}: {
  account: SubAccount
  amount: bigint
}): BalanceTransfer {
  if (!account.debtBalanceId) {
    throw new UnknownBalanceError(account.id)
  } else if (!account.superAccount.lentBalanceId) {
    throw new UnknownBalanceError(account.superAccount.id)
  }
  return {
    sourceBalanceId: account.debtBalanceId,
    destinationBalanceId: account.superAccount.lentBalanceId,
    amount
  }
}
