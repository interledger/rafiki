export class GrantError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GrantError'
  }
}

export function isGrantError(error: unknown): error is GrantError {
  return error instanceof GrantError
}
