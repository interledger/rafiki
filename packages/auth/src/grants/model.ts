import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { AccessToken } from '../accessTokens/model'
import { Limit } from '../limits/model'

export enum Actions {
  Create = 'create',
  Read = 'read',
  List = 'list'
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

export enum AccessTypes {
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
  public type!: AccessTypes
  public actions!: Actions[]
  public startMethod!: StartMethods[]

  public continueToken?: string
  public continueId?: string
  public wait?: number

  public finishMethod!: FinishMethods
  public finishUri!: string
  public nonce!: string

  public interactRef!: string
}
