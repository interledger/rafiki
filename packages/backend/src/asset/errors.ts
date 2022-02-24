export enum AssetError {
  DuplicateAsset = 'DuplicateAsset',
  UnknownAsset = 'UnknownAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAssetError = (o: any): o is AssetError =>
  Object.values(AssetError).includes(o)
