import { BaseModel } from '../../../shared/baseModel'

export class WalletAddressAdditionalProperty extends BaseModel {
  public static get tableName(): string {
    return 'walletAddressAdditionalProperties'
  }

  public id!: string
  public walletAddressId!: string
  public fieldKey!: string
  public fieldValue!: string
  public visibleInOpenPayments!: boolean
}
