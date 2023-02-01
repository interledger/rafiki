import {
  CreateAccountError as CreateAccountErrorCode,
  CreateTransferError as CreateTransferErrorCode
} from 'tigerbeetle-node'

export class TigerbeetleCreateAccountError extends Error {
  constructor(public code: number) {
    super('CreateAccountError code=' + code)
    this.name = 'CreateAccountError'
  }
}

export class TigerbeetleCreateTransferError extends Error {
  constructor(public code: CreateTransferErrorCode) {
    super()
    this.name = 'CreateTransferError'
  }
}

export function areAllAccountExistsErrors(
  errors: CreateAccountErrorCode[]
): boolean {
  return areAllOfTypeAccountErrors(errors, [
    CreateAccountErrorCode.exists_with_different_debits_pending,
    CreateAccountErrorCode.exists_with_different_debits_posted,
    CreateAccountErrorCode.exists_with_different_credits_pending,
    CreateAccountErrorCode.exists_with_different_credits_posted,
    CreateAccountErrorCode.exists
  ])
}

export function areAllOfTypeAccountErrors(
  errorsOccurred: CreateAccountErrorCode[],
  errToVerify: CreateAccountErrorCode[]
): boolean {
  for (const occurred of errorsOccurred) {
    if (!errToVerify.includes(occurred)) return false
  }
  return true
}
