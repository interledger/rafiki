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
  /** The `UInt8` scalar type represents unsigned 8-bit whole numeric values, ranging from 0 to 255. */
  UInt8: { input: any; output: any; }
  /** The `UInt64` scalar type represents unsigned 64-bit whole numeric values. It is capable of handling values that are larger than the JavaScript `Number` type limit (greater than 2^53). */
  UInt64: { input: any; output: any; }
};

export type Access = Model & {
  __typename?: 'Access';
  /** Actions allowed with this access. */
  actions: Array<Maybe<Scalars['String']['output']>>;
  /** The date and time when the access was created. */
  createdAt: Scalars['String']['output'];
  /** Unique identifier of the access object. */
  id: Scalars['ID']['output'];
  /** Wallet address of the sub-resource (incoming payment, outgoing payment, or quote). */
  identifier?: Maybe<Scalars['String']['output']>;
  /** Limits for an outgoing payment associated with this access. */
  limits?: Maybe<LimitData>;
  /** Type of access (incoming payment, outgoing payment, or quote). */
  type: Scalars['String']['output'];
};

export type FilterFinalizationReason = {
  /** List of finalization reasons to include in the filter. */
  in?: InputMaybe<Array<GrantFinalization>>;
  /** List of finalization reasons to exclude in the filter. */
  notIn?: InputMaybe<Array<GrantFinalization>>;
};

export type FilterGrantState = {
  /** List of states to include in the filter. */
  in?: InputMaybe<Array<GrantState>>;
  /** List of states to exclude in the filter. */
  notIn?: InputMaybe<Array<GrantState>>;
};

export type FilterString = {
  /** Array of strings to filter by. */
  in?: InputMaybe<Array<Scalars['String']['input']>>;
};

export type Grant = Model & {
  __typename?: 'Grant';
  /** Details of the access provided by the grant. */
  access: Array<Access>;
  /** Wallet address of the grantee's account. */
  client: Scalars['String']['output'];
  /** The date and time when the grant was created. */
  createdAt: Scalars['String']['output'];
  /** Specific outcome of a finalized grant, indicating whether the grant was issued, revoked, or rejected. */
  finalizationReason?: Maybe<GrantFinalization>;
  /** Unique identifier of the grant. */
  id: Scalars['ID']['output'];
  /** Current state of the grant. */
  state: GrantState;
  /** Details of the subject provided by the grant. */
  subject?: Maybe<Subject>;
  /** Unique identifier of the tenant associated with the grant. */
  tenantId: Scalars['ID']['output'];
};

export type GrantEdge = {
  __typename?: 'GrantEdge';
  /** A cursor for paginating through the grants. */
  cursor: Scalars['String']['output'];
  /** A grant node in the list. */
  node: Grant;
};

export type GrantFilter = {
  /** Filter grants by their finalization reason. */
  finalizationReason?: InputMaybe<FilterFinalizationReason>;
  /** Filter grants by their unique identifier. */
  identifier?: InputMaybe<FilterString>;
  /** Filter grants by their state. */
  state?: InputMaybe<FilterGrantState>;
};

export enum GrantFinalization {
  /** The grant was issued successfully. */
  Issued = 'ISSUED',
  /** The grant request was rejected. */
  Rejected = 'REJECTED',
  /** The grant was revoked. */
  Revoked = 'REVOKED'
}

export enum GrantState {
  /** The grant request has been approved. */
  Approved = 'APPROVED',
  /** The grant request has been finalized, and no more access tokens or interactions can be made. */
  Finalized = 'FINALIZED',
  /** The grant request is awaiting interaction. */
  Pending = 'PENDING',
  /** The grant request is processing. */
  Processing = 'PROCESSING'
}

export type GrantsConnection = {
  __typename?: 'GrantsConnection';
  /** A list of edges representing grants and cursors for pagination. */
  edges: Array<GrantEdge>;
  /** Information to aid in pagination. */
  pageInfo: PageInfo;
};

export type LimitData = {
  __typename?: 'LimitData';
  /** Amount to debit. */
  debitAmount?: Maybe<PaymentAmount>;
  /** Interval between payments. */
  interval?: Maybe<Scalars['String']['output']>;
  /** Amount to receive. */
  receiveAmount?: Maybe<PaymentAmount>;
  /** Wallet address URL of the receiver. */
  receiver?: Maybe<Scalars['String']['output']>;
};

export type Model = {
  /** The date and time when the model was created. */
  createdAt: Scalars['String']['output'];
  /** Unique identifier for the model. */
  id: Scalars['ID']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Revoke an existing grant. */
  revokeGrant: RevokeGrantMutationResponse;
};


export type MutationRevokeGrantArgs = {
  input: RevokeGrantInput;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** The cursor used to fetch the next page when paginating forward. */
  endCursor?: Maybe<Scalars['String']['output']>;
  /** Indicates if there are more pages when paginating forward. */
  hasNextPage: Scalars['Boolean']['output'];
  /** Indicates if there are more pages when paginating backward. */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** The cursor used to fetch the next page when paginating backward. */
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type PaymentAmount = {
  __typename?: 'PaymentAmount';
  /** Should be an ISO 4217 currency code whenever possible, e.g. `USD`. For more information, refer to [assets](https://rafiki.dev/overview/concepts/accounting/#assets). */
  assetCode: Scalars['String']['output'];
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit. */
  assetScale: Scalars['UInt8']['output'];
  /** The value of the payment amount. */
  value: Scalars['UInt64']['output'];
};

export type Query = {
  __typename?: 'Query';
  /** Fetch a specific grant by its ID. */
  grant: Grant;
  /** Fetch a paginated list of grants. */
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
  sortOrder?: InputMaybe<SortOrder>;
  tenantId?: InputMaybe<Scalars['ID']['input']>;
};

export type RevokeGrantInput = {
  /** Unique identifier of the grant to revoke. */
  grantId: Scalars['String']['input'];
};

export type RevokeGrantMutationResponse = {
  __typename?: 'RevokeGrantMutationResponse';
  /** Unique identifier of the revoked grant. */
  id: Scalars['ID']['output'];
};

export enum SortOrder {
  /** Sort the results in ascending order. */
  Asc = 'ASC',
  /** Sort the results in descending order. */
  Desc = 'DESC'
}

export type Subject = {
  __typename?: 'Subject';
  sub_ids: Array<SubjectItem>;
};

export type SubjectItem = Model & {
  __typename?: 'SubjectItem';
  /** The date and time when the subject was created. */
  createdAt: Scalars['String']['output'];
  /** Unique identifier of the subject object. */
  id: Scalars['ID']['output'];
  /** Wallet address of the subject's account. */
  subId: Scalars['String']['output'];
  /** Format of the subject identifier */
  subIdFormat: Scalars['String']['output'];
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
export type ResolversInterfaceTypes<_RefType extends Record<string, unknown>> = {
  Model: ( Partial<Access> ) | ( Partial<Grant> ) | ( Partial<SubjectItem> );
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  Access: ResolverTypeWrapper<Partial<Access>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  FilterFinalizationReason: ResolverTypeWrapper<Partial<FilterFinalizationReason>>;
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
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentAmount: ResolverTypeWrapper<Partial<PaymentAmount>>;
  Query: ResolverTypeWrapper<{}>;
  RevokeGrantInput: ResolverTypeWrapper<Partial<RevokeGrantInput>>;
  RevokeGrantMutationResponse: ResolverTypeWrapper<Partial<RevokeGrantMutationResponse>>;
  SortOrder: ResolverTypeWrapper<Partial<SortOrder>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  Subject: ResolverTypeWrapper<Partial<Subject>>;
  SubjectItem: ResolverTypeWrapper<Partial<SubjectItem>>;
  UInt8: ResolverTypeWrapper<Partial<Scalars['UInt8']['output']>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']['output']>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Access: Partial<Access>;
  Boolean: Partial<Scalars['Boolean']['output']>;
  FilterFinalizationReason: Partial<FilterFinalizationReason>;
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
  PageInfo: Partial<PageInfo>;
  PaymentAmount: Partial<PaymentAmount>;
  Query: {};
  RevokeGrantInput: Partial<RevokeGrantInput>;
  RevokeGrantMutationResponse: Partial<RevokeGrantMutationResponse>;
  String: Partial<Scalars['String']['output']>;
  Subject: Partial<Subject>;
  SubjectItem: Partial<SubjectItem>;
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
  subject?: Resolver<Maybe<ResolversTypes['Subject']>, ParentType, ContextType>;
  tenantId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  __resolveType: TypeResolveFn<'Access' | 'Grant' | 'SubjectItem', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  revokeGrant?: Resolver<ResolversTypes['RevokeGrantMutationResponse'], ParentType, ContextType, RequireFields<MutationRevokeGrantArgs, 'input'>>;
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
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SubjectResolvers<ContextType = any, ParentType extends ResolversParentTypes['Subject'] = ResolversParentTypes['Subject']> = {
  sub_ids?: Resolver<Array<ResolversTypes['SubjectItem']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SubjectItemResolvers<ContextType = any, ParentType extends ResolversParentTypes['SubjectItem'] = ResolversParentTypes['SubjectItem']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  subId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  subIdFormat?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentAmount?: PaymentAmountResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RevokeGrantMutationResponse?: RevokeGrantMutationResponseResolvers<ContextType>;
  Subject?: SubjectResolvers<ContextType>;
  SubjectItem?: SubjectItemResolvers<ContextType>;
  UInt8?: GraphQLScalarType;
  UInt64?: GraphQLScalarType;
};

