import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessToken/model'
import { Limit } from '../limit/model'

export enum Action {
  Create = 'create',
  Read = 'read',
  List = 'list'
}

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

export enum AccessType {
  Account = 'account',
  IncomingPayment = 'incomingPayment',
  OutgoingPayment = 'outgoingPayment',
  Quote = 'quote'
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
    },
    grants: {
      relation: Model.HasManyRelation,
      modelClass: Limit,
      join: {
        from: 'grants.id',
        to: 'limits.grantId'
      }
    }
  }

  public state!: GrantState
  public type!: AccessType
  public actions!: Action[]
  public startMethod!: StartMethod[]
  // public locations!: string[]
  // public identifier!: string
  public interval?: string

  public continueToken!: string
  public continueId!: string
  public wait?: number

  public finishMethod!: FinishMethod
  public finishUri!: string
  public clientNonce!: string // nonce for hash

  public interactId!: string
  public interactRef!: string
  public interactNonce!: string
}
