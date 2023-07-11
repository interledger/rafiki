import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  UInt8: any;
  UInt64: any;
};

export type Access = Model & {
  __typename?: 'Access';
  /** Access action (create, read, list or complete) */
  actions: Array<Maybe<Scalars['String']>>;
  /** Date-time of creation */
  createdAt: Scalars['String'];
  /** Access id */
  id: Scalars['ID'];
  /** Payment pointer of a sub-resource (incoming payment, outgoing payment, or quote) */
  identifier?: Maybe<Scalars['String']>;
  /** Payment limits */
  limits?: Maybe<LimitData>;
  /** Access type (incoming payment, outgoing payment, or quote) */
  type: Scalars['String'];
};

export type FilterGrantState = {
  notIn: Array<GrantState>;
};

export type FilterString = {
  in: Array<Scalars['String']>;
};

export type Grant = Model & {
  __typename?: 'Grant';
  /** Access details */
  access: Array<Access>;
  /** Payment pointer of the grantee's account */
  client: Scalars['String'];
  /** Date-time of creation */
  createdAt: Scalars['String'];
  /** Grant id */
  id: Scalars['ID'];
  /** State of the grant */
  state: GrantState;
};

export type GrantEdge = {
  __typename?: 'GrantEdge';
  cursor: Scalars['String'];
  node: Grant;
};

export type GrantFilter = {
  identifier?: InputMaybe<FilterString>;
  state?: InputMaybe<FilterGrantState>;
};

export enum GrantState {
  /** grant was approved */
  Granted = 'GRANTED',
  /** grant request was created but grant was not approved yet */
  Pending = 'PENDING',
  /** grant was rejected */
  Rejected = 'REJECTED',
  /** grant was revoked */
  Revoked = 'REVOKED'
}

export type GrantsConnection = {
  __typename?: 'GrantsConnection';
  edges: Array<GrantEdge>;
  pageInfo: PageInfo;
};

export type LimitData = {
  __typename?: 'LimitData';
  /** Interval between payments */
  interval?: Maybe<Scalars['String']>;
  /** Amount to receive */
  receiveAmount?: Maybe<PaymentAmount>;
  /** Payment pointer URL of the receiver */
  receiver?: Maybe<Scalars['String']>;
  /** Amount to send */
  sendAmount?: Maybe<PaymentAmount>;
};

export type Model = {
  createdAt: Scalars['String'];
  id: Scalars['ID'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Revoke Grant */
  revokeGrant: RevokeGrantMutationResponse;
};


export type MutationRevokeGrantArgs = {
  input: RevokeGrantInput;
};

export type MutationResponse = {
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** Paginating forwards: the cursor to continue. */
  endCursor?: Maybe<Scalars['String']>;
  /** Paginating forwards: Are there more pages? */
  hasNextPage: Scalars['Boolean'];
  /** Paginating backwards: Are there more pages? */
  hasPreviousPage: Scalars['Boolean'];
  /** Paginating backwards: the cursor to continue. */
  startCursor?: Maybe<Scalars['String']>;
};

export type PaymentAmount = {
  __typename?: 'PaymentAmount';
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  assetCode: Scalars['String'];
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  assetScale: Scalars['UInt8'];
  value: Scalars['UInt64'];
};

export type Query = {
  __typename?: 'Query';
  /** Fetch a grant */
  grant: Grant;
  /** Fetch a page of grants. */
  grants: GrantsConnection;
};


export type QueryGrantArgs = {
  id: Scalars['ID'];
};


export type QueryGrantsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  filter?: InputMaybe<GrantFilter>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type RevokeGrantInput = {
  grantId: Scalars['String'];
};

export type RevokeGrantMutationResponse = MutationResponse & {
  __typename?: 'RevokeGrantMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};



export type ResolverTypeWrapper<T> = Promise<T> | T;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> = ResolverFn<TResult, TParent, TContext, TArgs> | ResolverWithResolve<TResult, TParent, TContext, TArgs>;

export type ResolverFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => Promise<TResult> | TResult;

export type SubscriptionSubscribeFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => AsyncIterable<TResult> | Promise<AsyncIterable<TResult>>;

export type SubscriptionResolveFn<TResult, TParent, TContext, TArgs> = (
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;

export interface SubscriptionSubscriberObject<TResult, TKey extends string, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<{ [key in TKey]: TResult }, TParent, TContext, TArgs>;
  resolve?: SubscriptionResolveFn<TResult, { [key in TKey]: TResult }, TContext, TArgs>;
}

export interface SubscriptionResolverObject<TResult, TParent, TContext, TArgs> {
  subscribe: SubscriptionSubscribeFn<any, TParent, TContext, TArgs>;
  resolve: SubscriptionResolveFn<TResult, any, TContext, TArgs>;
}

export type SubscriptionObject<TResult, TKey extends string, TParent, TContext, TArgs> =
  | SubscriptionSubscriberObject<TResult, TKey, TParent, TContext, TArgs>
  | SubscriptionResolverObject<TResult, TParent, TContext, TArgs>;

export type SubscriptionResolver<TResult, TKey extends string, TParent = {}, TContext = {}, TArgs = {}> =
  | ((...args: any[]) => SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>)
  | SubscriptionObject<TResult, TKey, TParent, TContext, TArgs>;

export type TypeResolveFn<TTypes, TParent = {}, TContext = {}> = (
  parent: TParent,
  context: TContext,
  info: GraphQLResolveInfo
) => Maybe<TTypes> | Promise<Maybe<TTypes>>;

export type IsTypeOfResolverFn<T = {}, TContext = {}> = (obj: T, context: TContext, info: GraphQLResolveInfo) => boolean | Promise<boolean>;

export type NextResolverFn<T> = () => Promise<T>;

export type DirectiveResolverFn<TResult = {}, TParent = {}, TContext = {}, TArgs = {}> = (
  next: NextResolverFn<TResult>,
  parent: TParent,
  args: TArgs,
  context: TContext,
  info: GraphQLResolveInfo
) => TResult | Promise<TResult>;



/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Access: ResolverTypeWrapper<Partial<Access>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  FilterGrantState: ResolverTypeWrapper<Partial<FilterGrantState>>;
  FilterString: ResolverTypeWrapper<Partial<FilterString>>;
  Grant: ResolverTypeWrapper<Partial<Grant>>;
  GrantEdge: ResolverTypeWrapper<Partial<GrantEdge>>;
  GrantFilter: ResolverTypeWrapper<Partial<GrantFilter>>;
  GrantState: ResolverTypeWrapper<Partial<GrantState>>;
  GrantsConnection: ResolverTypeWrapper<Partial<GrantsConnection>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  LimitData: ResolverTypeWrapper<Partial<LimitData>>;
  Model: ResolversTypes['Access'] | ResolversTypes['Grant'];
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['RevokeGrantMutationResponse'];
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentAmount: ResolverTypeWrapper<Partial<PaymentAmount>>;
  Query: ResolverTypeWrapper<{}>;
  RevokeGrantInput: ResolverTypeWrapper<Partial<RevokeGrantInput>>;
  RevokeGrantMutationResponse: ResolverTypeWrapper<Partial<RevokeGrantMutationResponse>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  UInt8: ResolverTypeWrapper<Partial<Scalars['UInt8']>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Access: Partial<Access>;
  Boolean: Partial<Scalars['Boolean']>;
  FilterGrantState: Partial<FilterGrantState>;
  FilterString: Partial<FilterString>;
  Grant: Partial<Grant>;
  GrantEdge: Partial<GrantEdge>;
  GrantFilter: Partial<GrantFilter>;
  GrantsConnection: Partial<GrantsConnection>;
  ID: Partial<Scalars['ID']>;
  Int: Partial<Scalars['Int']>;
  LimitData: Partial<LimitData>;
  Model: ResolversParentTypes['Access'] | ResolversParentTypes['Grant'];
  Mutation: {};
  MutationResponse: ResolversParentTypes['RevokeGrantMutationResponse'];
  PageInfo: Partial<PageInfo>;
  PaymentAmount: Partial<PaymentAmount>;
  Query: {};
  RevokeGrantInput: Partial<RevokeGrantInput>;
  RevokeGrantMutationResponse: Partial<RevokeGrantMutationResponse>;
  String: Partial<Scalars['String']>;
  UInt8: Partial<Scalars['UInt8']>;
  UInt64: Partial<Scalars['UInt64']>;
};

export type AccessResolvers<ContextType = any, ParentType extends ResolversParentTypes['Access'] = ResolversParentTypes['Access']> = {
  actions?: Resolver<Array<Maybe<ResolversTypes['String']>>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  identifier?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  limits?: Resolver<Maybe<ResolversTypes['LimitData']>, ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GrantResolvers<ContextType = any, ParentType extends ResolversParentTypes['Grant'] = ResolversParentTypes['Grant']> = {
  access?: Resolver<Array<ResolversTypes['Access']>, ParentType, ContextType>;
  client?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['GrantState'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GrantEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['GrantEdge'] = ResolversParentTypes['GrantEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Grant'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type GrantsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['GrantsConnection'] = ResolversParentTypes['GrantsConnection']> = {
  edges?: Resolver<Array<ResolversTypes['GrantEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LimitDataResolvers<ContextType = any, ParentType extends ResolversParentTypes['LimitData'] = ResolversParentTypes['LimitData']> = {
  interval?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  receiveAmount?: Resolver<Maybe<ResolversTypes['PaymentAmount']>, ParentType, ContextType>;
  receiver?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sendAmount?: Resolver<Maybe<ResolversTypes['PaymentAmount']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ModelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Model'] = ResolversParentTypes['Model']> = {
  __resolveType: TypeResolveFn<'Access' | 'Grant', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  revokeGrant?: Resolver<ResolversTypes['RevokeGrantMutationResponse'], ParentType, ContextType, RequireFields<MutationRevokeGrantArgs, 'input'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'RevokeGrantMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentAmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentAmount'] = ResolversParentTypes['PaymentAmount']> = {
  assetCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  assetScale?: Resolver<ResolversTypes['UInt8'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  grant?: Resolver<ResolversTypes['Grant'], ParentType, ContextType, RequireFields<QueryGrantArgs, 'id'>>;
  grants?: Resolver<ResolversTypes['GrantsConnection'], ParentType, ContextType, Partial<QueryGrantsArgs>>;
};

export type RevokeGrantMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeGrantMutationResponse'] = ResolversParentTypes['RevokeGrantMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UInt8ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt8'], any> {
  name: 'UInt8';
}

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type Resolvers<ContextType = any> = {
  Access?: AccessResolvers<ContextType>;
  Grant?: GrantResolvers<ContextType>;
  GrantEdge?: GrantEdgeResolvers<ContextType>;
  GrantsConnection?: GrantsConnectionResolvers<ContextType>;
  LimitData?: LimitDataResolvers<ContextType>;
  Model?: ModelResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentAmount?: PaymentAmountResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RevokeGrantMutationResponse?: RevokeGrantMutationResponseResolvers<ContextType>;
  UInt8?: GraphQLScalarType;
  UInt64?: GraphQLScalarType;
};

