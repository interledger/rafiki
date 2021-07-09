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
  invoices?: Maybe<InvoiceConnection>;
};


export type AccountInvoicesArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};

export type Amount = {
  __typename?: 'Amount';
  amount: Scalars['Int'];
  currency: Scalars['String'];
  scale: Scalars['Int'];
};

export type CreateOutgoingPaymentInput = {
  superAccountId: Scalars['String'];
  paymentPointer?: Maybe<Scalars['String']>;
  amountToSend?: Maybe<Scalars['String']>;
  invoiceUrl?: Maybe<Scalars['String']>;
  autoApprove: Scalars['Boolean'];
};

export type Invoice = {
  __typename?: 'Invoice';
  id: Scalars['ID'];
  receivedAmount: Amount;
  maximumAmount?: Maybe<Amount>;
  active: Scalars['Boolean'];
  createdAt: Scalars['String'];
  expiresAt?: Maybe<Scalars['String']>;
  description?: Maybe<Scalars['String']>;
  totalAmount: Scalars['String'];
};

export type InvoiceConnection = {
  __typename?: 'InvoiceConnection';
  pageInfo: PageInfo;
  edges: Array<InvoiceEdge>;
};

export type InvoiceEdge = {
  __typename?: 'InvoiceEdge';
  node: Invoice;
  cursor: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createOutgoingPayment: OutgoingPaymentResponse;
  /** Approve a Ready payment's quote. */
  approveOutgoingPayment: OutgoingPaymentResponse;
  /** Requote a Cancelled payment. */
  requoteOutgoingPayment: OutgoingPaymentResponse;
  /** Cancel a Ready payment. */
  cancelOutgoingPayment: OutgoingPaymentResponse;
};


export type MutationCreateOutgoingPaymentArgs = {
  input: CreateOutgoingPaymentInput;
};


export type MutationApproveOutgoingPaymentArgs = {
  paymentId: Scalars['String'];
};


export type MutationRequoteOutgoingPaymentArgs = {
  paymentId: Scalars['String'];
};


export type MutationCancelOutgoingPaymentArgs = {
  paymentId: Scalars['String'];
};

export type OutgoingPayment = {
  __typename?: 'OutgoingPayment';
  id: Scalars['ID'];
  state: PaymentState;
  error?: Maybe<Scalars['String']>;
  attempts: Scalars['Int'];
  intent?: Maybe<PaymentIntent>;
  quote?: Maybe<PaymentQuote>;
  sourceAccount: PaymentSourceAccount;
  destinationAccount: PaymentDestinationAccount;
  outcome: PaymentProgress;
};

export type OutgoingPaymentResponse = {
  __typename?: 'OutgoingPaymentResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message?: Maybe<Scalars['String']>;
  payment?: Maybe<OutgoingPayment>;
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

export type PaymentDestinationAccount = {
  __typename?: 'PaymentDestinationAccount';
  scale: Scalars['Int'];
  code: Scalars['String'];
  url?: Maybe<Scalars['String']>;
  paymentPointer?: Maybe<Scalars['String']>;
};

export type PaymentIntent = {
  __typename?: 'PaymentIntent';
  paymentPointer?: Maybe<Scalars['String']>;
  amountToSend?: Maybe<Scalars['String']>;
  invoiceUrl?: Maybe<Scalars['String']>;
  autoApprove: Scalars['Boolean'];
};

export type PaymentProgress = {
  __typename?: 'PaymentProgress';
  amountSent: Scalars['String'];
  amountDelivered: Scalars['String'];
};

export type PaymentQuote = {
  __typename?: 'PaymentQuote';
  timestamp: Scalars['String'];
  activationDeadline: Scalars['String'];
  targetType: PaymentType;
  minDeliveryAmount: Scalars['String'];
  maxSourceAmount: Scalars['String'];
  maxPacketAmount: Scalars['String'];
  minExchangeRate: Scalars['Float'];
  lowExchangeRateEstimate: Scalars['Float'];
  highExchangeRateEstimate: Scalars['Float'];
};

export type PaymentSourceAccount = {
  __typename?: 'PaymentSourceAccount';
  scale: Scalars['Int'];
  code: Scalars['String'];
};

export enum PaymentState {
  /** Will transition to READY when quote is complete */
  Inactive = 'INACTIVE',
  /** Quote ready; awaiting user approval (ACTIVATED) or refusal (CANCELLING) */
  Ready = 'READY',
  /** Will transition to SENDING once payment funds are reserved */
  Activated = 'ACTIVATED',
  /** Paying, will transition to COMPLETED on success */
  Sending = 'SENDING',
  /** Will transition to CANCELLED when reserved funds are rolled back */
  Cancelling = 'CANCELLING',
  /** Payment aborted; can be requoted to INACTIVE */
  Cancelled = 'CANCELLED',
  /** Successfuly completion */
  Completed = 'COMPLETED'
}

export enum PaymentType {
  FixedSend = 'FIXED_SEND',
  FixedDelivery = 'FIXED_DELIVERY'
}

export type Query = {
  __typename?: 'Query';
  account?: Maybe<Account>;
  outgoingPayment?: Maybe<OutgoingPayment>;
};


export type QueryAccountArgs = {
  id: Scalars['String'];
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String'];
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
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  Invoice: ResolverTypeWrapper<Partial<Invoice>>;
  InvoiceConnection: ResolverTypeWrapper<Partial<InvoiceConnection>>;
  InvoiceEdge: ResolverTypeWrapper<Partial<InvoiceEdge>>;
  Mutation: ResolverTypeWrapper<{}>;
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentDestinationAccount: ResolverTypeWrapper<Partial<PaymentDestinationAccount>>;
  PaymentIntent: ResolverTypeWrapper<Partial<PaymentIntent>>;
  PaymentProgress: ResolverTypeWrapper<Partial<PaymentProgress>>;
  PaymentQuote: ResolverTypeWrapper<Partial<PaymentQuote>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']>>;
  PaymentSourceAccount: ResolverTypeWrapper<Partial<PaymentSourceAccount>>;
  PaymentState: ResolverTypeWrapper<Partial<PaymentState>>;
  PaymentType: ResolverTypeWrapper<Partial<PaymentType>>;
  Query: ResolverTypeWrapper<{}>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Account: Partial<Account>;
  ID: Partial<Scalars['ID']>;
  String: Partial<Scalars['String']>;
  Int: Partial<Scalars['Int']>;
  Amount: Partial<Amount>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  Boolean: Partial<Scalars['Boolean']>;
  Invoice: Partial<Invoice>;
  InvoiceConnection: Partial<InvoiceConnection>;
  InvoiceEdge: Partial<InvoiceEdge>;
  Mutation: {};
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  PaymentDestinationAccount: Partial<PaymentDestinationAccount>;
  PaymentIntent: Partial<PaymentIntent>;
  PaymentProgress: Partial<PaymentProgress>;
  PaymentQuote: Partial<PaymentQuote>;
  Float: Partial<Scalars['Float']>;
  PaymentSourceAccount: Partial<PaymentSourceAccount>;
  Query: {};
};

export type AccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Account'] = ResolversParentTypes['Account']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  invoices?: Resolver<Maybe<ResolversTypes['InvoiceConnection']>, ParentType, ContextType, RequireFields<AccountInvoicesArgs, never>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Invoice'] = ResolversParentTypes['Invoice']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  maximumAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  active?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  totalAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['InvoiceConnection'] = ResolversParentTypes['InvoiceConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['InvoiceEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type InvoiceEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['InvoiceEdge'] = ResolversParentTypes['InvoiceEdge']> = {
  node?: Resolver<ResolversTypes['Invoice'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  approveOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationApproveOutgoingPaymentArgs, 'paymentId'>>;
  requoteOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationRequoteOutgoingPaymentArgs, 'paymentId'>>;
  cancelOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCancelOutgoingPaymentArgs, 'paymentId'>>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['PaymentState'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  attempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  intent?: Resolver<Maybe<ResolversTypes['PaymentIntent']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['PaymentQuote']>, ParentType, ContextType>;
  sourceAccount?: Resolver<ResolversTypes['PaymentSourceAccount'], ParentType, ContextType>;
  destinationAccount?: Resolver<ResolversTypes['PaymentDestinationAccount'], ParentType, ContextType>;
  outcome?: Resolver<ResolversTypes['PaymentProgress'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentResponse'] = ResolversParentTypes['OutgoingPaymentResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  payment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentDestinationAccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentDestinationAccount'] = ResolversParentTypes['PaymentDestinationAccount']> = {
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  url?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  paymentPointer?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentIntentResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentIntent'] = ResolversParentTypes['PaymentIntent']> = {
  paymentPointer?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  amountToSend?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  invoiceUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  autoApprove?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentProgressResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentProgress'] = ResolversParentTypes['PaymentProgress']> = {
  amountSent?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  amountDelivered?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentQuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentQuote'] = ResolversParentTypes['PaymentQuote']> = {
  timestamp?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  activationDeadline?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  targetType?: Resolver<ResolversTypes['PaymentType'], ParentType, ContextType>;
  minDeliveryAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  maxSourceAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  minExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  lowExchangeRateEstimate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  highExchangeRateEstimate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentSourceAccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentSourceAccount'] = ResolversParentTypes['PaymentSourceAccount']> = {
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType, RequireFields<QueryAccountArgs, 'id'>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
};

export type Resolvers<ContextType = any> = {
  Account?: AccountResolvers<ContextType>;
  Amount?: AmountResolvers<ContextType>;
  Invoice?: InvoiceResolvers<ContextType>;
  InvoiceConnection?: InvoiceConnectionResolvers<ContextType>;
  InvoiceEdge?: InvoiceEdgeResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentDestinationAccount?: PaymentDestinationAccountResolvers<ContextType>;
  PaymentIntent?: PaymentIntentResolvers<ContextType>;
  PaymentProgress?: PaymentProgressResolvers<ContextType>;
  PaymentQuote?: PaymentQuoteResolvers<ContextType>;
  PaymentSourceAccount?: PaymentSourceAccountResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = any> = Resolvers<ContextType>;
