export interface CacheDataStore {
  keyTtlMs: number
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<boolean>
  delete(key: string): Promise<boolean>
}
