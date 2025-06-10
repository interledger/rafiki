import { WebhookEvent } from '../webhook/model'
import { QueryContext } from 'objection'

export enum GrantEventType {
  GrantRevoked = 'grant.revoked'
}

export enum GrantEventError {
  GrantIdRequired = 'Grant ID is required for grant events'
}

export interface GrantResponse {
  id: string
  revokedAt: string
}

export type GrantData = GrantResponse & WebhookEvent['data']
export class GrantEvent extends WebhookEvent {
  public type!: GrantEventType
  public data!: GrantData

  public $beforeInsert(context: QueryContext): void {
    super.$beforeInsert(context)

    if (!this.grantId) {
      throw new Error(GrantEventError.GrantIdRequired)
    }
  }
}
