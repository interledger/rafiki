import { Model } from 'objection'

import { AuthServer } from '../authServer/model'
import { BaseModel } from '../../shared/baseModel'
import { AccessType, AccessAction } from '@interledger/open-payments'

export class Grant extends BaseModel {
  public static get tableName(): string {
    return 'grants'
  }

  static get virtualAttributes(): string[] {
    return ['expired']
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
  public managementUrl?: string | null
  public accessType!: AccessType
  public accessActions!: AccessAction[]
  public expiresAt?: Date | null
  public deletedAt?: Date

  public get expired(): boolean {
    return !!this.expiresAt && this.expiresAt <= new Date()
  }

  // Fallback for legacy grants; wrong for tenant-scoped auth servers.
  // TODO: soft-delete grants without managementUrl and drop managementId.
  public getManagementUrl(): string | undefined {
    if (this.managementUrl) {
      return this.managementUrl
    }
    if (this.authServer) {
      return `${this.authServer.url}/token/${this.managementId}`
    }
    return undefined
  }
}
