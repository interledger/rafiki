export enum TenantError {
  TenantNotFound = 'TenantNotFound'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isTenantError = (o: any): o is TenantError =>
  Object.values(TenantError).includes(o)

export const errorToMessage: {
  [key in TenantError]: string
} = {
  [TenantError.TenantNotFound]: 'Tenant not found'
}
