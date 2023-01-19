import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { Access } from '../access/model'
import { join } from 'path'

export enum StartMethod {
  Redirect = 'redirect'
}

export enum FinishMethod {
  Redirect = 'redirect'
}

export enum GrantState {
  Pending = 'pending',
  Granted = 'granted',
  Revoked = 'revoked',
  Rejected = 'rejected'
}

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    accessTokens: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../accessToken/model'),
      join: {
        from: 'grants.id',
        to: 'accessTokens.grantId'
      }
    },
    access: {
      relation: Model.HasManyRelation,
      modelClass: join(__dirname, '../access/model'),
      join: {
        from: 'grants.id',
        to: 'accesses.grantId'
      }
    }
  })
  public access!: Access[]
  public state!: GrantState
  public startMethod!: StartMethod[]
  public identifier!: string

  public continueToken!: string
  public continueId!: string
  public wait?: number

  public finishMethod?: FinishMethod
  public finishUri?: string
  public client!: string
  public clientNonce?: string // client-generated nonce for post-interaction hash
  public clientKeyId!: string

  public interactId?: string
  public interactRef?: string
  public interactNonce?: string // AS-generated nonce for post-interaction hash
}

export interface InteractiveGrant extends Grant {
  finishMethod: NonNullable<Grant['finishMethod']>
  finishUri: NonNullable<Grant['finishUri']>
  interactId: NonNullable<Grant['interactId']>
  interactRef: NonNullable<Grant['interactRef']>
  interactNonce: NonNullable<Grant['interactNonce']> // AS-generated nonce for post-interaction hash
}

export function isInteractiveGrant(grant: Grant): grant is InteractiveGrant {
  return !!(
    grant.finishMethod &&
    grant.finishUri &&
    grant.interactId &&
    grant.interactRef &&
    grant.interactNonce
  )
}
