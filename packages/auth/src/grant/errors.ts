export enum GrantError {
  OnlyOneAccessAmountAllowed = 'only one access amount allowed'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isGrantError = (o: any): o is GrantError =>
  Object.values(GrantError).includes(o)

export const errorToHTTPCode: {
  [key in GrantError]: number
} = {
  [GrantError.OnlyOneAccessAmountAllowed]: 400
}
