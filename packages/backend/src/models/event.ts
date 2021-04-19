import { BaseModel } from './base'

export class Event extends BaseModel {
  public static get tableName(): string {
    return 'events'
  }

  public name!: string
  public type!: string
  public typeId!: string
  public payload!: Record<string, unknown>
}
