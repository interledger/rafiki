export interface CacheDataStore {
  get(key: string): Promise<string | undefined>
  getKeyExpiry(key: string): Promise<Date | undefined>
  set(key: string, value: string): Promise<boolean>
  delete(key: string): Promise<void>
  deleteAll(): Promise<void>
}
