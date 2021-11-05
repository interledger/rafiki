export enum SessionError {
  SessionExpired = 'SessionExpired',
  UnknownSession = 'UnknownSession'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isSessionError = (o: any): o is SessionError =>
  Object.values(SessionError).includes(o)
