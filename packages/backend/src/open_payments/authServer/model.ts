import { BaseModel } from '../../shared/baseModel'

export class AuthServer extends BaseModel {
  public static get tableName(): string {
    return 'authServers'
  }

  public url!: string
}
