export enum AccessError {
  OnlyOneAccessAmountAllowed = 'only one access amount allowed'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAccessError = (o: any): o is AccessError =>
  Object.values(AccessError).includes(o)
