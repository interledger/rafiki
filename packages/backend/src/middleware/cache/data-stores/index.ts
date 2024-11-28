export interface CacheDataStore<T> {
  get(key: string): Promise<T | undefined>
  getKeyExpiry(key: string): Promise<Date | undefined>
  set(key: string, value: T): Promise<boolean>
  delete(key: string): Promise<void>
  deleteAll(): Promise<void>
}
