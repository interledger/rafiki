export enum ApiKeyError {
  UnknownApiKey = 'UnknownApiKey'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isApiKeyError = (o: any): o is ApiKeyError =>
  Object.values(ApiKeyError).includes(o)
