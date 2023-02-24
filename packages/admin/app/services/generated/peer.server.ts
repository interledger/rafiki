import * as Types from '../../generated/graphql';

export type GetPeerQueryVariables = Types.Exact<{
  id: Types.Scalars['String'];
}>;


export type GetPeerQuery = { __typename?: 'Query', peer?: { __typename?: 'Peer', id: string, name?: string | null, staticIlpAddress: string, maxPacketAmount?: bigint | null, createdAt: string, asset: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null }, http: { __typename?: 'Http', outgoing: { __typename?: 'HttpOutgoing', endpoint: string, authToken: string } } } | null };

export type ListPeersQueryVariables = Types.Exact<{
  after?: Types.InputMaybe<Types.Scalars['String']>;
  before?: Types.InputMaybe<Types.Scalars['String']>;
  first?: Types.InputMaybe<Types.Scalars['Int']>;
  last?: Types.InputMaybe<Types.Scalars['Int']>;
}>;


export type ListPeersQuery = { __typename?: 'Query', peers: { __typename?: 'PeersConnection', edges: Array<{ __typename?: 'PeerEdge', node: { __typename?: 'Peer', id: string, name?: string | null, staticIlpAddress: string, http: { __typename?: 'Http', outgoing: { __typename?: 'HttpOutgoing', endpoint: string } }, asset: { __typename?: 'Asset', code: string, scale: number } } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type CreatePeerMutationVariables = Types.Exact<{
  input: Types.CreatePeerInput;
}>;


export type CreatePeerMutation = { __typename?: 'Mutation', createPeer: { __typename?: 'CreatePeerMutationResponse', code: string, success: boolean, message: string, peer?: { __typename?: 'Peer', id: string } | null } };

export type UpdatePeerMutationVariables = Types.Exact<{
  input: Types.UpdatePeerInput;
}>;


export type UpdatePeerMutation = { __typename?: 'Mutation', updatePeer: { __typename?: 'UpdatePeerMutationResponse', code: string, success: boolean, message: string } };
