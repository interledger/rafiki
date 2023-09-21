import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type MakeEmpty<T extends { [key: string]: unknown }, K extends keyof T> = { [_ in K]?: never };
export type Incremental<T> = T | { [P in keyof T]?: P extends ' $fragmentName' | '__typename' ? T[P] : never };
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: { input: string; output: string; }
  String: { input: string; output: string; }
  Boolean: { input: boolean; output: boolean; }
  Int: { input: number; output: number; }
  Float: { input: number; output: number; }
  UInt8: { input: any; output: any; }
  UInt64: { input: any; output: any; }
};

export type Access = Model & {
  __typename?: 'Access';
  /** Access action (create, read, list or complete) */
  actions: Array<Maybe<Scalars['String']['output']>>;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Access id */
  id: Scalars['ID']['output'];
  /** Wallet address of a sub-resource (incoming payment, outgoing payment, or quote) */
  identifier?: Maybe<Scalars['String']['output']>;
  /** Payment limits */
  limits?: Maybe<LimitData>;
  /** Access type (incoming payment, outgoing payment, or quote) */
  type: Scalars['String']['output'];
};

export type FilterGrantState = {
  in?: InputMaybe<Array<GrantState>>;
  notIn?: InputMaybe<Array<GrantState>>;
};

export type FilterString = {
  in?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Grant = Model & {
  __typename?: 'Grant';
  /** Access details */
  access: Array<Access>;
  /** Wallet address of the grantee's account */
  client: Scalars['String']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Reason a grant was finalized */
  finalizationReason?: Maybe<GrantFinalization>;
  /** Grant id */
  id: Scalars['ID']['output'];
  /** State of the grant */
  state: GrantState;
};

export type GrantEdge = {
  __typename?: 'GrantEdge';
  cursor: Scalars['String']['output'];
  node: Grant;
};

export type GrantFilter = {
  identifier?: InputMaybe<FilterString>;
  state?: InputMaybe<FilterGrantState>;
};

export enum GrantFinalization {
  /** grant was issued */
  Issued = 'ISSUED',
  /** grant was rejected */
  Rejected = 'REJECTED',
  /** grant was revoked */
  Revoked = 'REVOKED'
}

export enum GrantState {
  /** grant was approved */
  Approved = 'APPROVED',
  /** grant was finalized and no more access tokens or interactions can be made on it */
  Finalized = 'FINALIZED',
  /** grant request is awaiting interaction */
  Pending = 'PENDING',
  /** grant request is determining what state to enter next */
  Processing = 'PROCESSING'
}

export type GrantsConnection = {
  __typename?: 'GrantsConnection';
  edges: Array<GrantEdge>;
  pageInfo: PageInfo;
};

export type LimitData = {
  __typename?: 'LimitData';
  /** Amount to debit */
  debitAmount?: Maybe<PaymentAmount>;
  /** Interval between payments */
  interval?: Maybe<Scalars['String']['output']>;
  /** Amount to receive */
  receiveAmount?: Maybe<PaymentAmount>;
  /** Wallet address URL of the receiver */
  receiver?: Maybe<Scalars['String']['output']>;
};

export type Model = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
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
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** Paginating forwards: the cursor to continue. */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** Paginating forwards: Are there more pages? */
  hasNextPage: Scalars['Boolean']['output'];
  /** Paginating backwards: Are there more pages? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Paginating backwards: the cursor to continue. */
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PaymentAmount = {
  __typename?: 'PaymentAmount';
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  assetCode: Scalars['String']['output'];
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  assetScale: Scalars['UInt8']['output'];
  value: Scalars['UInt64']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Fetch a grant */
  grant: Grant;
  /** Fetch a page of grants. */
  grants: GrantsConnection;
};


export type QueryGrantArgs = {
  id: Scalars['ID']['input'];
};


export type QueryGrantsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<GrantFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type RevokeGrantInput = {
  grantId: Scalars['String']['input'];
};

export type RevokeGrantMutationResponse = MutationResponse & {
  __typename?: 'RevokeGrantMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
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


/** Mapping of interface types */
export type ResolversInterfaceTypes<RefType extends Record<string, unknown>> = {
  Model: ( Partial<Access> ) | ( Partial<Grant> );
  MutationResponse: ( Partial<RevokeGrantMutationResponse> );
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Access: ResolverTypeWrapper<Partial<Access>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  FilterGrantState: ResolverTypeWrapper<Partial<FilterGrantState>>;
  FilterString: ResolverTypeWrapper<Partial<FilterString>>;
  Grant: ResolverTypeWrapper<Partial<Grant>>;
  GrantEdge: ResolverTypeWrapper<Partial<GrantEdge>>;
  GrantFilter: ResolverTypeWrapper<Partial<GrantFilter>>;
  GrantFinalization: ResolverTypeWrapper<Partial<GrantFinalization>>;
  GrantState: ResolverTypeWrapper<Partial<GrantState>>;
  GrantsConnection: ResolverTypeWrapper<Partial<GrantsConnection>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']['output']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']['output']>>;
  LimitData: ResolverTypeWrapper<Partial<LimitData>>;
  Model: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Model']>;
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['MutationResponse']>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentAmount: ResolverTypeWrapper<Partial<PaymentAmount>>;
  Query: ResolverTypeWrapper<{}>;
  RevokeGrantInput: ResolverTypeWrapper<Partial<RevokeGrantInput>>;
  RevokeGrantMutationResponse: ResolverTypeWrapper<Partial<RevokeGrantMutationResponse>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  UInt8: ResolverTypeWrapper<Partial<Scalars['UInt8']['output']>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']['output']>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Access: Partial<Access>;
  Boolean: Partial<Scalars['Boolean']['output']>;
  FilterGrantState: Partial<FilterGrantState>;
  FilterString: Partial<FilterString>;
  Grant: Partial<Grant>;
  GrantEdge: Partial<GrantEdge>;
  GrantFilter: Partial<GrantFilter>;
  GrantsConnection: Partial<GrantsConnection>;
  ID: Partial<Scalars['ID']['output']>;
  Int: Partial<Scalars['Int']['output']>;
  LimitData: Partial<LimitData>;
  Model: ResolversInterfaceTypes<ResolversParentTypes>['Model'];
  Mutation: {};
  MutationResponse: ResolversInterfaceTypes<ResolversParentTypes>['MutationResponse'];
  PageInfo: Partial<PageInfo>;
  PaymentAmount: Partial<PaymentAmount>;
  Query: {};
  RevokeGrantInput: Partial<RevokeGrantInput>;
  RevokeGrantMutationResponse: Partial<RevokeGrantMutationResponse>;
  String: Partial<Scalars['String']['output']>;
  UInt8: Partial<Scalars['UInt8']['output']>;
  UInt64: Partial<Scalars['UInt64']['output']>;
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
  finalizationReason?: Resolver<Maybe<ResolversTypes['GrantFinalization']>, ParentType, ContextType>;
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
  debitAmount?: Resolver<Maybe<ResolversTypes['PaymentAmount']>, ParentType, ContextType>;
  interval?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  receiveAmount?: Resolver<Maybe<ResolversTypes['PaymentAmount']>, ParentType, ContextType>;
  receiver?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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

