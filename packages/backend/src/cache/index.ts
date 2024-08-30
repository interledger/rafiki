import { Quote } from '../open_payments/quote/model'
import { WalletAddress } from '../open_payments/wallet_address/model'
import { OutgoingPayment } from '../open_payments/payment/outgoing/model'

export type CacheSupport = Quote | WalletAddress | OutgoingPayment | undefined

export interface CacheDataStore {
  get(key: string): Promise<CacheSupport>
  getKeyExpiry(key: string): Promise<Date | undefined>
  set(key: string, value: CacheSupport): Promise<boolean>
  delete(key: string): Promise<void>
  deleteAll(): Promise<void>
}
