import { Model } from 'objection'

import { AuthServer } from '../authServer/model'
import { BaseModel } from '../../shared/baseModel'
import { AccessType, AccessAction } from '@interledger/open-payments'

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  static get virtualAttributes(): string[] {
    return ['expired', 'managementUrl']
  }

  static relationMappings = {
    authServer: {
      relation: Model.BelongsToOneRelation,
      modelClass: AuthServer,
      join: {
        from: 'grants.authServerId',
        to: 'authServers.id'
      }
    }
  }

  public authServerId!: string
  public authServer?: AuthServer
  public continueId?: string
  public continueToken?: string
  public accessToken!: string
  public managementId!: string
  public accessType!: AccessType
  public accessActions!: AccessAction[]
  public expiresAt?: Date | null
  public deletedAt?: Date

  public get expired(): boolean {
    return !!this.expiresAt && this.expiresAt <= new Date()
  }

  public getManagementUrl(authServerUrl: string): string {
    return `${authServerUrl}/token/${this.managementId}`
  }
}
