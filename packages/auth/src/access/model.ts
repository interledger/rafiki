import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { LimitData } from './types'
import { join } from 'path'
import {
  AccessType,
  AccessAction,
  AccessItem as OpenPaymentsAccessItem
} from '@interledger/open-payments'

export class Access extends BaseModel {
  public static get tableName(): string {
    return 'accesses'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    grant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'accesses.grantId',
        to: 'grants.id'
      }
    }
  })

  public id!: string
  public grantId!: string
  public type!: AccessType
  public actions!: AccessAction[]
  public identifier?: string
  public limits?: LimitData
}

export function toOpenPaymentsAccess(
  accessItem: Access
): OpenPaymentsAccessItem {
  return {
    actions: accessItem.actions,
    identifier: accessItem.identifier ?? undefined,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    type: accessItem.type as any,
    limits: accessItem.limits ?? undefined
  }
}
