import { GraphQLResolveInfo } from 'graphql';
export type Maybe<T> = T | null;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type RequireFields<T, K extends keyof T> = { [X in Exclude<keyof T, K>]?: T[X] } & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
};

export type Account = {
  __typename?: 'Account';
  id: Scalars['ID'];
  balance: Amount;
};

export type Amount = {
  __typename?: 'Amount';
  amount: Scalars['Int'];
  currency: Scalars['String'];
  scale?: Maybe<Scalars['Int']>;
};

export type Invoice = {
  __typename?: 'Invoice';
  id: Scalars['ID'];
  items: Array<Maybe<InvoiceItem>>;
  totalAmount: Scalars['String'];
};

export type InvoiceConnection = {
  __typename?: 'InvoiceConnection';
  pageInfo: PageInfo;
  edges: Array<Maybe<InvoiceEdge>>;
};

export type InvoiceEdge = {
  __typename?: 'InvoiceEdge';
  node: Invoice;
  cursor: Scalars['String'];
};

export type InvoiceItem = {
  __typename?: 'InvoiceItem';
  id: Scalars['ID'];
  receivedAmount: Amount;
  maximumAmount?: Maybe<Amount>;
  active: Scalars['Boolean'];
  createdAt: Scalars['String'];
  expiresAt?: Maybe<Scalars['String']>;
  description?: Maybe<Scalars['String']>;
};

export type PageInfo = {
  __typename?: 'PageInfo';
  /** Paginating forwards: the cursor to continue. */
  endCursor?: Maybe<Scalars['String']>;
  /** Paginating forwards: Are the more pages? */
  hasNextPage: Scalars['Boolean'];
  /** Paginating backwards: Are the more pages? */
  hasPreviousPage: Scalars['Boolean'];
  /** Paginating backwards: the cursor to continue. */
  startCursor?: Maybe<Scalars['String']>;
};

export type Query = {
  __typename?: 'Query';
  user?: Maybe<User>;
};

export type User = {
  __typename?: 'User';
  id: Scalars['ID'];
  balance: Amount;
  account: Account;
  /**
   * invoices
   * @param after Returns the elements in the list that come after the specified cursor.
   * @param before Returns the elements in the list that come before the specified cursor.
   * @param first Returns the first _n_ elements from the list.
   * @param last Returns the last _n_ elements from the list.
   */
  invoices?: Maybe<InvoiceConnection>;
};


export type UserInvoicesArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};



export type ResolverTypeWrapper<T> = Promise<T>;


export type LegacyStitchingResolver<TResult, TParent, TContext, TArgs> = {
  fragment: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

export type NewStitchingResolver<TResult, TParent, TContext, TArgs> = {
  selectionSet: string;
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};
export type StitchingResolver<TResult, TParent, TContext, TArgs> = LegacyStitchingResolver<TResult, TParent, TContext, TArgs> | NewStitchingResolver<TResult, TParent, TContext, TArgs>;
export type Resolver<TResult, TParent = {}, TContext = {}, TArgs = {}> =
  | ResolverFn<TResult, TParent, TContext, TArgs>
  | StitchingResolver<TResult, TParent, TContext, TArgs>;

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
) => AsyncIterator<TResult> | Promise<AsyncIterator<TResult>>;

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
  Account: ResolverTypeWrapper<Partial<Account>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Invoice: ResolverTypeWrapper<Partial<Invoice>>;
  InvoiceConnection: ResolverTypeWrapper<Partial<InvoiceConnection>>;
  InvoiceEdge: ResolverTypeWrapper<Partial<InvoiceEdge>>;
  InvoiceItem: ResolverTypeWrapper<Partial<InvoiceItem>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Query: ResolverTypeWrapper<{}>;
  User: ResolverTypeWrapper<Partial<User>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Account: Partial<Account>;
  ID: Partial<Scalars['ID']>;
  Amount: Partial<Amount>;
  Int: Partial<Scalars['Int']>;
  String: Partial<Scalars['String']>;
  Invoice: Partial<Invoice>;
  InvoiceConnection: Partial<InvoiceConnection>;
  InvoiceEdge: Partial<InvoiceEdge>;
  InvoiceItem: Partial<InvoiceItem>;
  Boolean: Partial<Scalars['Boolean']>;
  PageInfo: Partial<PageInfo>;
  Query: {};
  User: Partial<User>;
};

export type AccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Account'] = ResolversParentTypes['Account']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Invoice'] = ResolversParentTypes['Invoice']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  items?: Resolver<Array<Maybe<ResolversTypes['InvoiceItem']>>, ParentType, ContextType>;
  totalAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['InvoiceConnection'] = ResolversParentTypes['InvoiceConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<Maybe<ResolversTypes['InvoiceEdge']>>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['InvoiceEdge'] = ResolversParentTypes['InvoiceEdge']> = {
  node?: Resolver<ResolversTypes['Invoice'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceItemResolvers<ContextType = any, ParentType extends ResolversParentTypes['InvoiceItem'] = ResolversParentTypes['InvoiceItem']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  maximumAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  user?: Resolver<Maybe<ResolversTypes['User']>, ParentType, ContextType>;
};

export type UserResolvers<ContextType = any, ParentType extends ResolversParentTypes['User'] = ResolversParentTypes['User']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  account?: Resolver<ResolversTypes['Account'], ParentType, ContextType>;
  invoices?: Resolver<Maybe<ResolversTypes['InvoiceConnection']>, ParentType, ContextType, RequireFields<UserInvoicesArgs, never>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Account?: AccountResolvers<ContextType>;
  Amount?: AmountResolvers<ContextType>;
  Invoice?: InvoiceResolvers<ContextType>;
  InvoiceConnection?: InvoiceConnectionResolvers<ContextType>;
  InvoiceEdge?: InvoiceEdgeResolvers<ContextType>;
  InvoiceItem?: InvoiceItemResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  User?: UserResolvers<ContextType>;
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = any> = Resolvers<ContextType>;
