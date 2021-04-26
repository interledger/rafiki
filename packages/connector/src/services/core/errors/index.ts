export * from './invalid-json-body-error'

export class AccountNotFoundError extends Error {
  constructor (accountId: string, peerId?: string) {
    super(
      'Account not found. accountId=' + accountId + ' peerId=' + peerId ||
        'NOT SPECIFIED'
    )
    this.name = 'AccountNotFoundError'
  }
}

export class PeerNotFoundError extends Error {
  constructor (peerId: string) {
    super('Peer not found. peerId=' + peerId)
    this.name = 'PeerNotFoundError'
  }
}
