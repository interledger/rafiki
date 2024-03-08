import { Model } from 'objection'
import { join } from 'path'
import { BaseModel } from '../shared/baseModel'
import { Grant } from '../grant/model'

export enum InteractionState {
  Pending = 'PENDING', // Awaiting interaction from resource owner (RO)
  Approved = 'APPROVED', // RO approved interaction
  Denied = 'DENIED' // RO Rejected interaction
}

export class Interaction extends BaseModel {
  public static get tableName(): string {
    return 'interactions'
  }

  static relationMappings = () => ({
    grant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'interactions.grantId',
        to: 'grants.id'
      }
    }
  })

  public grantId!: string
  public ref!: string
  public nonce!: string // AS-generated nonce for post-interaction hash
  public state!: InteractionState
  public expiresIn!: number

  public grant?: Grant
}

export interface InteractionWithGrant extends Interaction {
  grant: NonNullable<Interaction['grant']>
}

export function isInteractionWithGrant(
  interaction: Interaction
): interaction is InteractionWithGrant {
  return !!interaction.grant
}
