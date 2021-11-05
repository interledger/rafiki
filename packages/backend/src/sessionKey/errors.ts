export enum SessionKeyError {
  SessionExpired = 'SessionExpired',
  UnknownSession = 'UnknownSession'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isSessionKeyError = (o: any): o is SessionKeyError =>
  Object.values(SessionKeyError).includes(o)
