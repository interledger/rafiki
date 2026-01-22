import { HttpStatusCode } from 'axios'
import { GNAPErrorCode } from '../shared/gnapErrors'
import { AccessError } from '../access/errors'

export enum GrantErrorCode {
  InvalidRequest,
  OnlyOneAccessAmountAllowed
}

export class GrantError extends Error {
  code: GrantErrorCode
  constructor(code: GrantErrorCode, message: string) {
    super(message)
    this.name = 'GrantError'
    this.code = code
  }
}

export function isGrantError(error: unknown): error is GrantError {
  return error instanceof GrantError
}

export const errorToHTTPCode: {
  [key in GrantErrorCode]: number
} = {
  [GrantErrorCode.InvalidRequest]: HttpStatusCode.BadRequest,
  [GrantErrorCode.OnlyOneAccessAmountAllowed]: HttpStatusCode.BadRequest
}

export const errorToGNAPCode: {
  [key in GrantErrorCode]: GNAPErrorCode
} = {
  [GrantErrorCode.InvalidRequest]: GNAPErrorCode.InvalidRequest,
  [GrantErrorCode.OnlyOneAccessAmountAllowed]: GNAPErrorCode.InvalidRequest
}

export const errorToMessage: {
  [key in GrantErrorCode]: string
} = {
  [GrantErrorCode.InvalidRequest]: 'Invalid request',
  [GrantErrorCode.OnlyOneAccessAmountAllowed]: 'only one access amount allowed'
}

export const accessErrorToGrantError: {
  [key in AccessError]: GrantErrorCode
} = {
  [AccessError.OnlyOneAccessAmountAllowed]:
    GrantErrorCode.OnlyOneAccessAmountAllowed
}
