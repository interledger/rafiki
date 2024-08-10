export enum GrantError {
  GrantRequiresInteraction = 'GrantRequiresInteraction',
  InvalidGrantRequest = 'InvalidGrantRequest'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isGrantError = (o: any): o is GrantError =>
  Object.values(GrantError).includes(o)
