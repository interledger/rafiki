export enum CreateError {
  InvalidExpiresAt = 'InvalidExpiresAt',
  InvalidInterval = 'InvalidInterval',
  UnknownAccount = 'UnknownAccount',
  UnknownAsset = 'UnknownAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isCreateError = (o: any): o is CreateError =>
  Object.values(CreateError).includes(o)

export enum RevokeError {
  AlreadyExpired = 'AlreadyExpired',
  AlreadyRevoked = 'AlreadyRevoked',
  UnknownMandate = 'UnknownMandate'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isRevokeError = (o: any): o is RevokeError =>
  Object.values(RevokeError).includes(o)
