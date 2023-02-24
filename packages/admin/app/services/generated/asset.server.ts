import * as Types from '../../generated/graphql';

export type GetAssetQueryVariables = Types.Exact<{
  id: Types.Scalars['String'];
}>;


export type GetAssetQuery = { __typename?: 'Query', asset?: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null, createdAt: string } | null };

export type ListAssetsQueryVariables = Types.Exact<{
  after?: Types.InputMaybe<Types.Scalars['String']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
}>;


export type ListAssetsQuery = { __typename?: 'Query', assets: { __typename?: 'AssetsConnection', edges: Array<{ __typename?: 'AssetEdge', node: { __typename?: 'Asset', code: string, id: string, scale: number, withdrawalThreshold?: bigint | null, createdAt: string } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type CreateAssetMutationVariables = Types.Exact<{
  input: Types.CreateAssetInput;
}>;


export type CreateAssetMutation = { __typename?: 'Mutation', createAsset: { __typename?: 'AssetMutationResponse', code: string, success: boolean, message: string, asset?: { __typename?: 'Asset', id: string } | null } };

export type UpdateAssetMutationVariables = Types.Exact<{
  input: Types.UpdateAssetInput;
}>;


export type UpdateAssetMutation = { __typename?: 'Mutation', updateAssetWithdrawalThreshold: { __typename?: 'AssetMutationResponse', code: string, success: boolean, message: string } };
