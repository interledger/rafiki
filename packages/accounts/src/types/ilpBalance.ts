import { Asset } from './asset'

export interface IlpBalance {
  id: string
  asset: Asset
  balance: bigint
  availableCredit: bigint
  creditExtended: bigint
}
