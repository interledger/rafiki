import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessTokens/model'

export enum Actions {
  Create = 'create',
  Read = 'read'
}

export enum StartMethods {
  Redirect = 'redirect'
}

export enum FinishMethods {
  Redirect = 'redirect'
}

export enum GrantState {
  Pending = 'pending',
  Granted = 'granted',
  Revoked = 'revoked'
}

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  static relationMappings = {
    accessTokens: {
      relation: Model.HasManyRelation,
      modelClass: AccessToken,
      join: {
        from: 'grants.id',
        to: 'accessTokens.grantId'
      }
    }
  }

  public state!: GrantState
  public type!: string
  public actions!: Actions[]
  public start!: StartMethods[]

  public continueToken?: string
  public continueId?: string
  public wait?: number

  public finish!: FinishMethods[]
  public finishUri!: string
  public nonce!: string

  public interactRef!: string
}
