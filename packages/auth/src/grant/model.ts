import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessToken/model'
import { Access } from '../access/model'

export enum StartMethod {
  Redirect = 'redirect'
}

export enum FinishMethod {
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

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    accessTokens: {
      relation: Model.HasManyRelation,
      modelClass: AccessToken,
      join: {
        from: 'grants.id',
        to: 'accessTokens.grantId'
      }
    },
    access: {
      relation: Model.HasManyRelation,
      modelClass: Access,
      join: {
        from: 'grants.id',
        to: 'accesses.grantId'
      }
    }
  })
  public state!: GrantState
  public startMethod!: StartMethod[]

  public continueToken!: string
  public continueId!: string
  public wait?: number

  public finishMethod!: FinishMethod
  public finishUri!: string
  public clientNonce!: string // nonce for hash
  public clientKeyId!: string

  public interactId!: string
  public interactRef!: string
  public interactNonce!: string
}
