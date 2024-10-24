import { GraphQLErrorCode } from '../../../graphql/errors'

export enum WalletAddressKeyError {
  DuplicateKey = 'DuplicateKey'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isWalletAddressKeyError = (o: any): o is WalletAddressKeyError =>
  Object.values(WalletAddressKeyError).includes(o)

export const errorToCode: {
  [key in WalletAddressKeyError]: GraphQLErrorCode
} = {
  [WalletAddressKeyError.DuplicateKey]: GraphQLErrorCode.Duplicate
}

export const errorToMessage: {
  [key in WalletAddressKeyError]: string
} = {
  [WalletAddressKeyError.DuplicateKey]: 'Key already exists'
}
