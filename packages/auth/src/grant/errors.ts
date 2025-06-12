export enum GrantError {
  OnlyOneAccessAmountAllowed = 'only one access amount allowed'
}

export const isGrantError = (o: any): o is GrantError =>
  Object.values(GrantError).includes(o)

export const errorToHTTPCode: {
  [key in GrantError]: number
} = {
  [GrantError.OnlyOneAccessAmountAllowed]: 400
}
