import { BaseModel } from '../../shared/baseModel'
import { Model } from 'objection'
import { join } from 'path'

export enum DeviceStatus {
  Active = 'ACTIVE',
  Revoked = 'REVOKED'
}

export class PosDevice extends BaseModel {
  public static get tableName(): string {
    return 'posDevices'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    merchant: {
      relation: Model.BelongsToOneRelation,
      modelClass: join(__dirname, '../model'),
      join: {
        from: 'posDevices.merchantId',
        to: 'merchants.id'
      }
    }
  })

  public merchantId!: string // foreign key on merchants table
  public walletAddressId!: string

  public publicKey?: string // PEM format
  public keyId?: string
  public algorithm!: string // ecdsa-p256-sha256
  public status!: DeviceStatus // enum "ACTIVE" | "REVOKED"

  public deviceName!: string
  public deletedAt!: Date | null
}
