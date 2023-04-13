export interface CacheDataStore {
  keyTtlMs: number
  get(key: string): Promise<string | undefined>
  set(key: string, value: string): Promise<string>
  delete(key: string): Promise<boolean>
}
