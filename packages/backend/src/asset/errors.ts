import { GraphQLErrorCode } from '../graphql/errors'

export enum AssetError {
  DuplicateAsset = 'DuplicateAsset',
  UnknownAsset = 'UnknownAsset'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
export const isAssetError = (o: any): o is AssetError =>
  Object.values(AssetError).includes(o)

export const errorToCode: {
  [key in AssetError]: string
} = {
  [AssetError.UnknownAsset]: GraphQLErrorCode.NotFound,
  [AssetError.DuplicateAsset]: GraphQLErrorCode.Duplicate
}

export const errorToMessage: {
  [key in AssetError]: string
} = {
  [AssetError.UnknownAsset]: 'Asset not found',
  [AssetError.DuplicateAsset]: 'Asset already exists'
}
