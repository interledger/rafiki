export class SessionKeyExpiredError extends Error {
  constructor() {
    super('Session key expired')
    this.name = 'SessionKeyExpiredError'
  }
}
