import { Model } from 'objection'
import { BaseModel } from '../shared/baseModel'
import { join } from 'path'
import { SubjectItem } from './types'

export class Subject extends BaseModel {
  public static get tableName(): string {
    return 'subjects'
  }

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  static relationMappings = () => ({
    grant: {
      relation: Model.HasOneRelation,
      modelClass: join(__dirname, '../grant/model'),
      join: {
        from: 'subjects.grantId',
        to: 'grants.id'
      }
    }
  })

  public id!: string
  public grantId!: string
  public subId!: string
  public subIdFormat!: string
}

export function toOpenPaymentsSubject(subjectItem: Subject): SubjectItem {
  return {
    id: subjectItem.subId,
    format: subjectItem.subIdFormat
  }
}
