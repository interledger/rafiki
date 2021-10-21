export class SessionKeyExpiredError extends Error {
  constructor() {
    super('Session key expired')
    this.name = 'SessionKeyExpiredError'
  }
}

export class UnknownSessionError extends Error {
  constructor(public sessionKey: string) {
    super('Session not found. sessionKey=' + sessionKey)
    this.name = 'UnknownSessionError'
  }
}
