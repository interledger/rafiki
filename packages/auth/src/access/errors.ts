import { GNAPErrorCode } from '../shared/gnapErrors'

export enum AccessError {
  OnlyOneAccessAmountAllowed = 'only one access amount allowed'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccessError = (o: any): o is AccessError =>
  Object.values(AccessError).includes(o)

export const errorToHTTPCode: {
  [key in AccessError]: number
} = {
  [AccessError.OnlyOneAccessAmountAllowed]: 400
}

export const errorToGNAPCode: {
  [key in AccessError]: GNAPErrorCode
} = {
  [AccessError.OnlyOneAccessAmountAllowed]: GNAPErrorCode.InvalidRequest
}
