export enum AssetError {
  DuplicateAsset = 'DuplicateAsset',
  UnknownAsset = 'UnknownAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAssetError = (o: any): o is AssetError =>
  Object.values(AssetError).includes(o)

export const errorToCode: {
  [key in AssetError]: number
} = {
  [AssetError.UnknownAsset]: 404,
  [AssetError.DuplicateAsset]: 400
}

export const errorToMessage: {
  [key in AssetError]: string
} = {
  [AssetError.UnknownAsset]: 'unknown asset',
  [AssetError.DuplicateAsset]: 'Asset already exists'
}
