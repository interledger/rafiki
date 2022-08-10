import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | null;
export type InputMaybe<T> = T | undefined;
export type Exact<T extends { [key: string]: unknown }> = { [K in keyof T]: T[K] };
export type MakeOptional<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]?: Maybe<T[SubKey]> };
export type MakeMaybe<T, K extends keyof T> = Omit<T, K> & { [SubKey in K]: Maybe<T[SubKey]> };
export type Omit<T, K extends keyof T> = Pick<T, Exclude<keyof T, K>>;
export type RequireFields<T, K extends keyof T> = Omit<T, K> & { [P in K]-?: NonNullable<T[P]> };
/** All built-in and custom scalars, mapped to their actual values */
export type Scalars = {
  ID: string;
  String: string;
  Boolean: boolean;
  Int: number;
  Float: number;
  UInt64: bigint;
};

export type Account = Model & {
  __typename?: 'Account';
  id: Scalars['ID'];
  asset: Asset;
  incomingPayments?: Maybe<IncomingPaymentConnection>;
  quotes?: Maybe<QuoteConnection>;
  outgoingPayments?: Maybe<OutgoingPaymentConnection>;
  createdAt: Scalars['String'];
};


export type AccountIncomingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type AccountQuotesArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type AccountOutgoingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type AccountWithdrawal = {
  __typename?: 'AccountWithdrawal';
  id: Scalars['ID'];
  amount: Scalars['UInt64'];
  account: Account;
};

export type AccountWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'AccountWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<LiquidityError>;
  withdrawal?: Maybe<AccountWithdrawal>;
};

export type AddAssetLiquidityInput = {
  /** The id of the asset to add liquidity. */
  assetId: Scalars['String'];
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64'];
  /** The id of the transfer. */
  id: Scalars['String'];
};

export type AddPeerLiquidityInput = {
  /** The id of the peer to add liquidity. */
  peerId: Scalars['String'];
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64'];
  /** The id of the transfer. */
  id: Scalars['String'];
};

export type Amount = {
  __typename?: 'Amount';
  value: Scalars['UInt64'];
  assetCode: Scalars['String'];
  assetScale: Scalars['Int'];
};

export type AmountInput = {
  value: Scalars['UInt64'];
  assetCode: Scalars['String'];
  assetScale: Scalars['Int'];
};

export type ApiKey = Model & {
  __typename?: 'ApiKey';
  id: Scalars['ID'];
  accountId: Scalars['String'];
  key: Scalars['String'];
  createdAt: Scalars['String'];
  updatedAt: Scalars['String'];
};

export type Asset = Model & {
  __typename?: 'Asset';
  id: Scalars['ID'];
  code: Scalars['String'];
  scale: Scalars['Int'];
  withdrawalThreshold?: Maybe<Scalars['UInt64']>;
  createdAt: Scalars['String'];
};

export type AssetEdge = {
  __typename?: 'AssetEdge';
  node: Asset;
  cursor: Scalars['String'];
};

export type AssetInput = {
  code: Scalars['String'];
  scale: Scalars['Int'];
};

export type AssetMutationResponse = MutationResponse & {
  __typename?: 'AssetMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  asset?: Maybe<Asset>;
};

export type AssetsConnection = {
  __typename?: 'AssetsConnection';
  pageInfo: PageInfo;
  edges: Array<AssetEdge>;
};

export type CreateAccountInput = {
  asset: AssetInput;
  publicName?: InputMaybe<Scalars['String']>;
};

export type CreateAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  account?: Maybe<Account>;
};

export type CreateAccountWithdrawalInput = {
  /** The id of the Open Payments account to create the withdrawal for. */
  accountId: Scalars['String'];
  /** The id of the withdrawal. */
  id: Scalars['String'];
};

export type CreateApiKeyInput = {
  /** Account API key is created for. */
  accountId: Scalars['String'];
};

export type CreateApiKeyMutationResponse = MutationResponse & {
  __typename?: 'CreateApiKeyMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  apiKey?: Maybe<ApiKey>;
};

export type CreateAssetInput = {
  code: Scalars['String'];
  scale: Scalars['Int'];
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']>;
};

export type CreateAssetLiquidityWithdrawalInput = {
  /** The id of the asset to create the withdrawal for. */
  assetId: Scalars['String'];
  /** Amount of withdrawal. */
  amount: Scalars['UInt64'];
  /** The id of the withdrawal. */
  id: Scalars['String'];
};

export type CreateOutgoingPaymentInput = {
  accountId: Scalars['String'];
  quoteId: Scalars['String'];
  description?: InputMaybe<Scalars['String']>;
  externalRef?: InputMaybe<Scalars['String']>;
};

export type CreatePeerInput = {
  maxPacketAmount?: InputMaybe<Scalars['UInt64']>;
  http: HttpInput;
  asset: AssetInput;
  staticIlpAddress: Scalars['String'];
};

export type CreatePeerLiquidityWithdrawalInput = {
  /** The id of the peer to create the withdrawal for. */
  peerId: Scalars['String'];
  /** Amount of withdrawal. */
  amount: Scalars['UInt64'];
  /** The id of the withdrawal. */
  id: Scalars['String'];
};

export type CreatePeerMutationResponse = MutationResponse & {
  __typename?: 'CreatePeerMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  peer?: Maybe<Peer>;
};

export type CreateQuoteInput = {
  accountId: Scalars['String'];
  sendAmount?: InputMaybe<AmountInput>;
  receiveAmount?: InputMaybe<AmountInput>;
  receiver: Scalars['String'];
};

export type DeleteAllApiKeysInput = {
  /** Account API keys are deleted from. */
  accountId: Scalars['String'];
};

export type DeleteAllApiKeysMutationResponse = MutationResponse & {
  __typename?: 'DeleteAllApiKeysMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type DeletePeerMutationResponse = MutationResponse & {
  __typename?: 'DeletePeerMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Event = IncomingPaymentEvent | OutgoingPaymentEvent | WebMonetizationEvent;

export type EventEdge = {
  __typename?: 'EventEdge';
  node: Event;
  cursor: Scalars['String'];
};

export type EventsConnection = {
  __typename?: 'EventsConnection';
  pageInfo: PageInfo;
  edges: Array<EventEdge>;
};

export type Http = {
  __typename?: 'Http';
  outgoing: HttpOutgoing;
};

export type HttpIncomingInput = {
  authTokens: Array<Scalars['String']>;
};

export type HttpInput = {
  incoming?: InputMaybe<HttpIncomingInput>;
  outgoing: HttpOutgoingInput;
};

export type HttpOutgoing = {
  __typename?: 'HttpOutgoing';
  authToken: Scalars['String'];
  endpoint: Scalars['String'];
};

export type HttpOutgoingInput = {
  authToken: Scalars['String'];
  endpoint: Scalars['String'];
};

export type IncomingPayment = Model & {
  __typename?: 'IncomingPayment';
  id: Scalars['ID'];
  accountId: Scalars['ID'];
  completed: Scalars['Boolean'];
  expiresAt: Scalars['String'];
  incomingAmount?: Maybe<Amount>;
  receivedAmount: Amount;
  description?: Maybe<Scalars['String']>;
  externalRef?: Maybe<Scalars['String']>;
  createdAt: Scalars['String'];
};

export type IncomingPaymentConnection = {
  __typename?: 'IncomingPaymentConnection';
  pageInfo: PageInfo;
  edges: Array<IncomingPaymentEdge>;
};

export type IncomingPaymentEdge = {
  __typename?: 'IncomingPaymentEdge';
  node: IncomingPayment;
  cursor: Scalars['String'];
};

export type IncomingPaymentEvent = Model & {
  __typename?: 'IncomingPaymentEvent';
  id: Scalars['ID'];
  type: IncomingPaymentEventType;
  data: IncomingPaymentEventData;
  createdAt: Scalars['String'];
};

export type IncomingPaymentEventData = {
  __typename?: 'IncomingPaymentEventData';
  incomingPayment: IncomingPayment;
};

export enum IncomingPaymentEventType {
  IncomingPaymentExpired = 'INCOMING_PAYMENT_EXPIRED',
  IncomingPaymentCompleted = 'INCOMING_PAYMENT_COMPLETED'
}

export enum LiquidityError {
  AlreadyCommitted = 'AlreadyCommitted',
  AlreadyRolledBack = 'AlreadyRolledBack',
  AmountZero = 'AmountZero',
  InsufficientBalance = 'InsufficientBalance',
  InvalidId = 'InvalidId',
  TransferExists = 'TransferExists',
  UnknownAccount = 'UnknownAccount',
  UnknownAsset = 'UnknownAsset',
  UnknownIncomingPayment = 'UnknownIncomingPayment',
  UnknownPayment = 'UnknownPayment',
  UnknownPeer = 'UnknownPeer',
  UnknownTransfer = 'UnknownTransfer'
}

export type LiquidityMutationResponse = MutationResponse & {
  __typename?: 'LiquidityMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<LiquidityError>;
};

export type Model = {
  id: Scalars['ID'];
  createdAt: Scalars['String'];
};

export type Mutation = {
  __typename?: 'Mutation';
  createAccount: CreateAccountMutationResponse;
  triggerAccountEvents: TriggerAccountEventsMutationResponse;
  /** Create asset */
  createAsset: AssetMutationResponse;
  /** Update asset withdrawal threshold */
  updateAssetWithdrawalThreshold: AssetMutationResponse;
  /** Create peer */
  createPeer: CreatePeerMutationResponse;
  /** Update peer */
  updatePeer: UpdatePeerMutationResponse;
  /** Delete peer */
  deletePeer: DeletePeerMutationResponse;
  /** Add peer liquidity */
  addPeerLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Add asset liquidity */
  addAssetLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Create liquidity withdrawal from peer */
  createPeerLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create liquidity withdrawal from asset */
  createAssetLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create liquidity withdrawal from Open Payments account */
  createAccountWithdrawal?: Maybe<AccountWithdrawalMutationResponse>;
  /** Finalize liquidity withdrawal */
  finalizeLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Rollback liquidity withdrawal */
  rollbackLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  createQuote: QuoteResponse;
  createOutgoingPayment: OutgoingPaymentResponse;
  /** Deposit webhook event liquidity */
  depositEventLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Withdraw webhook event liquidity */
  withdrawEventLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Create API Key */
  createApiKey?: Maybe<CreateApiKeyMutationResponse>;
  /** Delete all API Keys */
  deleteAllApiKeys?: Maybe<DeleteAllApiKeysMutationResponse>;
  /** Redeem API Key */
  redeemApiKey?: Maybe<RedeemApiKeyMutationResponse>;
  /** Refresh Session */
  refreshSession?: Maybe<RefreshSessionMutationResponse>;
  /** Revoke Session */
  revokeSession?: Maybe<RevokeSessionMutationResponse>;
};


export type MutationCreateAccountArgs = {
  input: CreateAccountInput;
};


export type MutationTriggerAccountEventsArgs = {
  limit: Scalars['Int'];
};


export type MutationCreateAssetArgs = {
  input: CreateAssetInput;
};


export type MutationUpdateAssetWithdrawalThresholdArgs = {
  input: UpdateAssetInput;
};


export type MutationCreatePeerArgs = {
  input: CreatePeerInput;
};


export type MutationUpdatePeerArgs = {
  input: UpdatePeerInput;
};


export type MutationDeletePeerArgs = {
  id: Scalars['String'];
};


export type MutationAddPeerLiquidityArgs = {
  input: AddPeerLiquidityInput;
};


export type MutationAddAssetLiquidityArgs = {
  input: AddAssetLiquidityInput;
};


export type MutationCreatePeerLiquidityWithdrawalArgs = {
  input: CreatePeerLiquidityWithdrawalInput;
};


export type MutationCreateAssetLiquidityWithdrawalArgs = {
  input: CreateAssetLiquidityWithdrawalInput;
};


export type MutationCreateAccountWithdrawalArgs = {
  input: CreateAccountWithdrawalInput;
};


export type MutationFinalizeLiquidityWithdrawalArgs = {
  withdrawalId: Scalars['String'];
};


export type MutationRollbackLiquidityWithdrawalArgs = {
  withdrawalId: Scalars['String'];
};


export type MutationCreateQuoteArgs = {
  input: CreateQuoteInput;
};


export type MutationCreateOutgoingPaymentArgs = {
  input: CreateOutgoingPaymentInput;
};


export type MutationDepositEventLiquidityArgs = {
  eventId: Scalars['String'];
};


export type MutationWithdrawEventLiquidityArgs = {
  eventId: Scalars['String'];
};


export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationDeleteAllApiKeysArgs = {
  input: DeleteAllApiKeysInput;
};


export type MutationRedeemApiKeyArgs = {
  input: RedeemApiKeyInput;
};


export type MutationRefreshSessionArgs = {
  input: RefreshSessionInput;
};


export type MutationRevokeSessionArgs = {
  input: RevokeSessionInput;
};

export type MutationResponse = {
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type OutgoingPayment = Model & {
  __typename?: 'OutgoingPayment';
  id: Scalars['ID'];
  accountId: Scalars['ID'];
  state: OutgoingPaymentState;
  error?: Maybe<Scalars['String']>;
  sendAmount: Amount;
  receiveAmount: Amount;
  receiver: Scalars['String'];
  description?: Maybe<Scalars['String']>;
  externalRef?: Maybe<Scalars['String']>;
  quote?: Maybe<Quote>;
  sentAmount: Amount;
  createdAt: Scalars['String'];
};

export type OutgoingPaymentConnection = {
  __typename?: 'OutgoingPaymentConnection';
  pageInfo: PageInfo;
  edges: Array<OutgoingPaymentEdge>;
};

export type OutgoingPaymentEdge = {
  __typename?: 'OutgoingPaymentEdge';
  node: OutgoingPayment;
  cursor: Scalars['String'];
};

export type OutgoingPaymentEvent = Model & {
  __typename?: 'OutgoingPaymentEvent';
  id: Scalars['ID'];
  type: OutgoingPaymentEventType;
  data: OutgoingPaymentEventData;
  createdAt: Scalars['String'];
};

export type OutgoingPaymentEventData = {
  __typename?: 'OutgoingPaymentEventData';
  outgoingPayment: OutgoingPayment;
};

export enum OutgoingPaymentEventType {
  OutgoingPaymentCreated = 'OUTGOING_PAYMENT_CREATED',
  OutgoingPaymentFailed = 'OUTGOING_PAYMENT_FAILED',
  OutgoingPaymentCompleted = 'OUTGOING_PAYMENT_COMPLETED'
}

export type OutgoingPaymentResponse = {
  __typename?: 'OutgoingPaymentResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message?: Maybe<Scalars['String']>;
  payment?: Maybe<OutgoingPayment>;
};

export enum OutgoingPaymentState {
  /** Will transition to SENDING once payment funds are reserved */
  Funding = 'FUNDING',
  /** Paying, will transition to COMPLETED on success */
  Sending = 'SENDING',
  /** Successful completion */
  Completed = 'COMPLETED',
  /** Payment failed */
  Failed = 'FAILED'
}

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

export type Peer = Model & {
  __typename?: 'Peer';
  id: Scalars['ID'];
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http: Http;
  asset: Asset;
  staticIlpAddress: Scalars['String'];
  createdAt: Scalars['String'];
};

export type PeerEdge = {
  __typename?: 'PeerEdge';
  node: Peer;
  cursor: Scalars['String'];
};

export type PeersConnection = {
  __typename?: 'PeersConnection';
  pageInfo: PageInfo;
  edges: Array<PeerEdge>;
};

export type Query = {
  __typename?: 'Query';
  account?: Maybe<Account>;
  asset?: Maybe<Asset>;
  /** Fetch a page of assets. */
  assets: AssetsConnection;
  /** Fetch a page of events. */
  events: EventsConnection;
  peer?: Maybe<Peer>;
  /** Fetch a page of peers. */
  peers: PeersConnection;
  quote?: Maybe<Quote>;
  outgoingPayment?: Maybe<OutgoingPayment>;
};


export type QueryAccountArgs = {
  id: Scalars['String'];
};


export type QueryAssetArgs = {
  id: Scalars['String'];
};


export type QueryAssetsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type QueryEventsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type QueryPeerArgs = {
  id: Scalars['String'];
};


export type QueryPeersArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type QueryQuoteArgs = {
  id: Scalars['String'];
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String'];
};

export type Quote = {
  __typename?: 'Quote';
  id: Scalars['ID'];
  accountId: Scalars['ID'];
  receiver: Scalars['String'];
  sendAmount: Amount;
  receiveAmount: Amount;
  maxPacketAmount: Scalars['UInt64'];
  minExchangeRate: Scalars['Float'];
  lowEstimatedExchangeRate: Scalars['Float'];
  highEstimatedExchangeRate: Scalars['Float'];
  createdAt: Scalars['String'];
  expiresAt: Scalars['String'];
};

export type QuoteConnection = {
  __typename?: 'QuoteConnection';
  pageInfo: PageInfo;
  edges: Array<QuoteEdge>;
};

export type QuoteEdge = {
  __typename?: 'QuoteEdge';
  node: Quote;
  cursor: Scalars['String'];
};

export type QuoteResponse = {
  __typename?: 'QuoteResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message?: Maybe<Scalars['String']>;
  quote?: Maybe<Quote>;
};

export type RedeemApiKeyInput = {
  /** API key */
  key: Scalars['String'];
  /** Account API key was issued for. */
  accountId: Scalars['String'];
};

export type RedeemApiKeyMutationResponse = MutationResponse & {
  __typename?: 'RedeemApiKeyMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  session?: Maybe<Session>;
};

export type RefreshSessionInput = {
  /** Session key */
  key: Scalars['String'];
};

export type RefreshSessionMutationResponse = MutationResponse & {
  __typename?: 'RefreshSessionMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  session?: Maybe<Session>;
};

export type RevokeSessionInput = {
  /** Session key */
  key: Scalars['String'];
};

export type RevokeSessionMutationResponse = MutationResponse & {
  __typename?: 'RevokeSessionMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Session = {
  __typename?: 'Session';
  key: Scalars['String'];
  expiresAt: Scalars['String'];
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type TriggerAccountEventsMutationResponse = MutationResponse & {
  __typename?: 'TriggerAccountEventsMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  count?: Maybe<Scalars['Int']>;
};

export type UpdateAssetInput = {
  id: Scalars['String'];
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']>;
};

export type UpdatePeerInput = {
  id: Scalars['String'];
  maxPacketAmount?: InputMaybe<Scalars['UInt64']>;
  http?: InputMaybe<HttpInput>;
  staticIlpAddress?: InputMaybe<Scalars['String']>;
};

export type UpdatePeerMutationResponse = MutationResponse & {
  __typename?: 'UpdatePeerMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  peer?: Maybe<Peer>;
};

export type WebMonetization = {
  __typename?: 'WebMonetization';
  accountId: Scalars['ID'];
  amount: Amount;
};

export type WebMonetizationEvent = Model & {
  __typename?: 'WebMonetizationEvent';
  id: Scalars['ID'];
  type: WebMonetizationEventType;
  data: WebMonetizationEventData;
  createdAt: Scalars['String'];
};

export type WebMonetizationEventData = {
  __typename?: 'WebMonetizationEventData';
  webMonetization: WebMonetization;
};

export enum WebMonetizationEventType {
  WebMonetizationReceived = 'WEB_MONETIZATION_RECEIVED'
}



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
  Account: ResolverTypeWrapper<Partial<Account>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  AccountWithdrawal: ResolverTypeWrapper<Partial<AccountWithdrawal>>;
  AccountWithdrawalMutationResponse: ResolverTypeWrapper<Partial<AccountWithdrawalMutationResponse>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  AddAssetLiquidityInput: ResolverTypeWrapper<Partial<AddAssetLiquidityInput>>;
  AddPeerLiquidityInput: ResolverTypeWrapper<Partial<AddPeerLiquidityInput>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  AmountInput: ResolverTypeWrapper<Partial<AmountInput>>;
  ApiKey: ResolverTypeWrapper<Partial<ApiKey>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  AssetEdge: ResolverTypeWrapper<Partial<AssetEdge>>;
  AssetInput: ResolverTypeWrapper<Partial<AssetInput>>;
  AssetMutationResponse: ResolverTypeWrapper<Partial<AssetMutationResponse>>;
  AssetsConnection: ResolverTypeWrapper<Partial<AssetsConnection>>;
  CreateAccountInput: ResolverTypeWrapper<Partial<CreateAccountInput>>;
  CreateAccountMutationResponse: ResolverTypeWrapper<Partial<CreateAccountMutationResponse>>;
  CreateAccountWithdrawalInput: ResolverTypeWrapper<Partial<CreateAccountWithdrawalInput>>;
  CreateApiKeyInput: ResolverTypeWrapper<Partial<CreateApiKeyInput>>;
  CreateApiKeyMutationResponse: ResolverTypeWrapper<Partial<CreateApiKeyMutationResponse>>;
  CreateAssetInput: ResolverTypeWrapper<Partial<CreateAssetInput>>;
  CreateAssetLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreateAssetLiquidityWithdrawalInput>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  CreatePeerInput: ResolverTypeWrapper<Partial<CreatePeerInput>>;
  CreatePeerLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreatePeerLiquidityWithdrawalInput>>;
  CreatePeerMutationResponse: ResolverTypeWrapper<Partial<CreatePeerMutationResponse>>;
  CreateQuoteInput: ResolverTypeWrapper<Partial<CreateQuoteInput>>;
  DeleteAllApiKeysInput: ResolverTypeWrapper<Partial<DeleteAllApiKeysInput>>;
  DeleteAllApiKeysMutationResponse: ResolverTypeWrapper<Partial<DeleteAllApiKeysMutationResponse>>;
  DeletePeerMutationResponse: ResolverTypeWrapper<Partial<DeletePeerMutationResponse>>;
  Event: Partial<ResolversTypes['IncomingPaymentEvent'] | ResolversTypes['OutgoingPaymentEvent'] | ResolversTypes['WebMonetizationEvent']>;
  EventEdge: ResolverTypeWrapper<Partial<Omit<EventEdge, 'node'> & { node: ResolversTypes['Event'] }>>;
  EventsConnection: ResolverTypeWrapper<Partial<EventsConnection>>;
  Http: ResolverTypeWrapper<Partial<Http>>;
  HttpIncomingInput: ResolverTypeWrapper<Partial<HttpIncomingInput>>;
  HttpInput: ResolverTypeWrapper<Partial<HttpInput>>;
  HttpOutgoing: ResolverTypeWrapper<Partial<HttpOutgoing>>;
  HttpOutgoingInput: ResolverTypeWrapper<Partial<HttpOutgoingInput>>;
  IncomingPayment: ResolverTypeWrapper<Partial<IncomingPayment>>;
  IncomingPaymentConnection: ResolverTypeWrapper<Partial<IncomingPaymentConnection>>;
  IncomingPaymentEdge: ResolverTypeWrapper<Partial<IncomingPaymentEdge>>;
  IncomingPaymentEvent: ResolverTypeWrapper<Partial<IncomingPaymentEvent>>;
  IncomingPaymentEventData: ResolverTypeWrapper<Partial<IncomingPaymentEventData>>;
  IncomingPaymentEventType: ResolverTypeWrapper<Partial<IncomingPaymentEventType>>;
  LiquidityError: ResolverTypeWrapper<Partial<LiquidityError>>;
  LiquidityMutationResponse: ResolverTypeWrapper<Partial<LiquidityMutationResponse>>;
  Model: ResolversTypes['Account'] | ResolversTypes['ApiKey'] | ResolversTypes['Asset'] | ResolversTypes['IncomingPayment'] | ResolversTypes['IncomingPaymentEvent'] | ResolversTypes['OutgoingPayment'] | ResolversTypes['OutgoingPaymentEvent'] | ResolversTypes['Peer'] | ResolversTypes['WebMonetizationEvent'];
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['AccountWithdrawalMutationResponse'] | ResolversTypes['AssetMutationResponse'] | ResolversTypes['CreateAccountMutationResponse'] | ResolversTypes['CreateApiKeyMutationResponse'] | ResolversTypes['CreatePeerMutationResponse'] | ResolversTypes['DeleteAllApiKeysMutationResponse'] | ResolversTypes['DeletePeerMutationResponse'] | ResolversTypes['LiquidityMutationResponse'] | ResolversTypes['RedeemApiKeyMutationResponse'] | ResolversTypes['RefreshSessionMutationResponse'] | ResolversTypes['RevokeSessionMutationResponse'] | ResolversTypes['TransferMutationResponse'] | ResolversTypes['TriggerAccountEventsMutationResponse'] | ResolversTypes['UpdatePeerMutationResponse'];
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentConnection: ResolverTypeWrapper<Partial<OutgoingPaymentConnection>>;
  OutgoingPaymentEdge: ResolverTypeWrapper<Partial<OutgoingPaymentEdge>>;
  OutgoingPaymentEvent: ResolverTypeWrapper<Partial<OutgoingPaymentEvent>>;
  OutgoingPaymentEventData: ResolverTypeWrapper<Partial<OutgoingPaymentEventData>>;
  OutgoingPaymentEventType: ResolverTypeWrapper<Partial<OutgoingPaymentEventType>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  OutgoingPaymentState: ResolverTypeWrapper<Partial<OutgoingPaymentState>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Peer: ResolverTypeWrapper<Partial<Peer>>;
  PeerEdge: ResolverTypeWrapper<Partial<PeerEdge>>;
  PeersConnection: ResolverTypeWrapper<Partial<PeersConnection>>;
  Query: ResolverTypeWrapper<{}>;
  Quote: ResolverTypeWrapper<Partial<Quote>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']>>;
  QuoteConnection: ResolverTypeWrapper<Partial<QuoteConnection>>;
  QuoteEdge: ResolverTypeWrapper<Partial<QuoteEdge>>;
  QuoteResponse: ResolverTypeWrapper<Partial<QuoteResponse>>;
  RedeemApiKeyInput: ResolverTypeWrapper<Partial<RedeemApiKeyInput>>;
  RedeemApiKeyMutationResponse: ResolverTypeWrapper<Partial<RedeemApiKeyMutationResponse>>;
  RefreshSessionInput: ResolverTypeWrapper<Partial<RefreshSessionInput>>;
  RefreshSessionMutationResponse: ResolverTypeWrapper<Partial<RefreshSessionMutationResponse>>;
  RevokeSessionInput: ResolverTypeWrapper<Partial<RevokeSessionInput>>;
  RevokeSessionMutationResponse: ResolverTypeWrapper<Partial<RevokeSessionMutationResponse>>;
  Session: ResolverTypeWrapper<Partial<Session>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  TriggerAccountEventsMutationResponse: ResolverTypeWrapper<Partial<TriggerAccountEventsMutationResponse>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']>>;
  UpdateAssetInput: ResolverTypeWrapper<Partial<UpdateAssetInput>>;
  UpdatePeerInput: ResolverTypeWrapper<Partial<UpdatePeerInput>>;
  UpdatePeerMutationResponse: ResolverTypeWrapper<Partial<UpdatePeerMutationResponse>>;
  WebMonetization: ResolverTypeWrapper<Partial<WebMonetization>>;
  WebMonetizationEvent: ResolverTypeWrapper<Partial<WebMonetizationEvent>>;
  WebMonetizationEventData: ResolverTypeWrapper<Partial<WebMonetizationEventData>>;
  WebMonetizationEventType: ResolverTypeWrapper<Partial<WebMonetizationEventType>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Account: Partial<Account>;
  ID: Partial<Scalars['ID']>;
  String: Partial<Scalars['String']>;
  Int: Partial<Scalars['Int']>;
  AccountWithdrawal: Partial<AccountWithdrawal>;
  AccountWithdrawalMutationResponse: Partial<AccountWithdrawalMutationResponse>;
  Boolean: Partial<Scalars['Boolean']>;
  AddAssetLiquidityInput: Partial<AddAssetLiquidityInput>;
  AddPeerLiquidityInput: Partial<AddPeerLiquidityInput>;
  Amount: Partial<Amount>;
  AmountInput: Partial<AmountInput>;
  ApiKey: Partial<ApiKey>;
  Asset: Partial<Asset>;
  AssetEdge: Partial<AssetEdge>;
  AssetInput: Partial<AssetInput>;
  AssetMutationResponse: Partial<AssetMutationResponse>;
  AssetsConnection: Partial<AssetsConnection>;
  CreateAccountInput: Partial<CreateAccountInput>;
  CreateAccountMutationResponse: Partial<CreateAccountMutationResponse>;
  CreateAccountWithdrawalInput: Partial<CreateAccountWithdrawalInput>;
  CreateApiKeyInput: Partial<CreateApiKeyInput>;
  CreateApiKeyMutationResponse: Partial<CreateApiKeyMutationResponse>;
  CreateAssetInput: Partial<CreateAssetInput>;
  CreateAssetLiquidityWithdrawalInput: Partial<CreateAssetLiquidityWithdrawalInput>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  CreatePeerInput: Partial<CreatePeerInput>;
  CreatePeerLiquidityWithdrawalInput: Partial<CreatePeerLiquidityWithdrawalInput>;
  CreatePeerMutationResponse: Partial<CreatePeerMutationResponse>;
  CreateQuoteInput: Partial<CreateQuoteInput>;
  DeleteAllApiKeysInput: Partial<DeleteAllApiKeysInput>;
  DeleteAllApiKeysMutationResponse: Partial<DeleteAllApiKeysMutationResponse>;
  DeletePeerMutationResponse: Partial<DeletePeerMutationResponse>;
  Event: Partial<ResolversParentTypes['IncomingPaymentEvent'] | ResolversParentTypes['OutgoingPaymentEvent'] | ResolversParentTypes['WebMonetizationEvent']>;
  EventEdge: Partial<Omit<EventEdge, 'node'> & { node: ResolversParentTypes['Event'] }>;
  EventsConnection: Partial<EventsConnection>;
  Http: Partial<Http>;
  HttpIncomingInput: Partial<HttpIncomingInput>;
  HttpInput: Partial<HttpInput>;
  HttpOutgoing: Partial<HttpOutgoing>;
  HttpOutgoingInput: Partial<HttpOutgoingInput>;
  IncomingPayment: Partial<IncomingPayment>;
  IncomingPaymentConnection: Partial<IncomingPaymentConnection>;
  IncomingPaymentEdge: Partial<IncomingPaymentEdge>;
  IncomingPaymentEvent: Partial<IncomingPaymentEvent>;
  IncomingPaymentEventData: Partial<IncomingPaymentEventData>;
  LiquidityMutationResponse: Partial<LiquidityMutationResponse>;
  Model: ResolversParentTypes['Account'] | ResolversParentTypes['ApiKey'] | ResolversParentTypes['Asset'] | ResolversParentTypes['IncomingPayment'] | ResolversParentTypes['IncomingPaymentEvent'] | ResolversParentTypes['OutgoingPayment'] | ResolversParentTypes['OutgoingPaymentEvent'] | ResolversParentTypes['Peer'] | ResolversParentTypes['WebMonetizationEvent'];
  Mutation: {};
  MutationResponse: ResolversParentTypes['AccountWithdrawalMutationResponse'] | ResolversParentTypes['AssetMutationResponse'] | ResolversParentTypes['CreateAccountMutationResponse'] | ResolversParentTypes['CreateApiKeyMutationResponse'] | ResolversParentTypes['CreatePeerMutationResponse'] | ResolversParentTypes['DeleteAllApiKeysMutationResponse'] | ResolversParentTypes['DeletePeerMutationResponse'] | ResolversParentTypes['LiquidityMutationResponse'] | ResolversParentTypes['RedeemApiKeyMutationResponse'] | ResolversParentTypes['RefreshSessionMutationResponse'] | ResolversParentTypes['RevokeSessionMutationResponse'] | ResolversParentTypes['TransferMutationResponse'] | ResolversParentTypes['TriggerAccountEventsMutationResponse'] | ResolversParentTypes['UpdatePeerMutationResponse'];
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentConnection: Partial<OutgoingPaymentConnection>;
  OutgoingPaymentEdge: Partial<OutgoingPaymentEdge>;
  OutgoingPaymentEvent: Partial<OutgoingPaymentEvent>;
  OutgoingPaymentEventData: Partial<OutgoingPaymentEventData>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  Peer: Partial<Peer>;
  PeerEdge: Partial<PeerEdge>;
  PeersConnection: Partial<PeersConnection>;
  Query: {};
  Quote: Partial<Quote>;
  Float: Partial<Scalars['Float']>;
  QuoteConnection: Partial<QuoteConnection>;
  QuoteEdge: Partial<QuoteEdge>;
  QuoteResponse: Partial<QuoteResponse>;
  RedeemApiKeyInput: Partial<RedeemApiKeyInput>;
  RedeemApiKeyMutationResponse: Partial<RedeemApiKeyMutationResponse>;
  RefreshSessionInput: Partial<RefreshSessionInput>;
  RefreshSessionMutationResponse: Partial<RefreshSessionMutationResponse>;
  RevokeSessionInput: Partial<RevokeSessionInput>;
  RevokeSessionMutationResponse: Partial<RevokeSessionMutationResponse>;
  Session: Partial<Session>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  TriggerAccountEventsMutationResponse: Partial<TriggerAccountEventsMutationResponse>;
  UInt64: Partial<Scalars['UInt64']>;
  UpdateAssetInput: Partial<UpdateAssetInput>;
  UpdatePeerInput: Partial<UpdatePeerInput>;
  UpdatePeerMutationResponse: Partial<UpdatePeerMutationResponse>;
  WebMonetization: Partial<WebMonetization>;
  WebMonetizationEvent: Partial<WebMonetizationEvent>;
  WebMonetizationEventData: Partial<WebMonetizationEventData>;
};

export type AuthDirectiveArgs = { };

export type AuthDirectiveResolver<Result, Parent, ContextType = any, Args = AuthDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type IsAdminDirectiveArgs = { };

export type IsAdminDirectiveResolver<Result, Parent, ContextType = any, Args = IsAdminDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type AccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Account'] = ResolversParentTypes['Account']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  incomingPayments?: Resolver<Maybe<ResolversTypes['IncomingPaymentConnection']>, ParentType, ContextType, Partial<AccountIncomingPaymentsArgs>>;
  quotes?: Resolver<Maybe<ResolversTypes['QuoteConnection']>, ParentType, ContextType, Partial<AccountQuotesArgs>>;
  outgoingPayments?: Resolver<Maybe<ResolversTypes['OutgoingPaymentConnection']>, ParentType, ContextType, Partial<AccountOutgoingPaymentsArgs>>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AccountWithdrawalResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountWithdrawal'] = ResolversParentTypes['AccountWithdrawal']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  account?: Resolver<ResolversTypes['Account'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AccountWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountWithdrawalMutationResponse'] = ResolversParentTypes['AccountWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['LiquidityError']>, ParentType, ContextType>;
  withdrawal?: Resolver<Maybe<ResolversTypes['AccountWithdrawal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  value?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  assetCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  assetScale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ApiKeyResolvers<ContextType = any, ParentType extends ResolversParentTypes['ApiKey'] = ResolversParentTypes['ApiKey']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  accountId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  withdrawalThreshold?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetEdge'] = ResolversParentTypes['AssetEdge']> = {
  node?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetMutationResponse'] = ResolversParentTypes['AssetMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetsConnection'] = ResolversParentTypes['AssetsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['AssetEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateAccountMutationResponse'] = ResolversParentTypes['CreateAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateApiKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateApiKeyMutationResponse'] = ResolversParentTypes['CreateApiKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  apiKey?: Resolver<Maybe<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreatePeerMutationResponse'] = ResolversParentTypes['CreatePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteAllApiKeysMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteAllApiKeysMutationResponse'] = ResolversParentTypes['DeleteAllApiKeysMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeletePeerMutationResponse'] = ResolversParentTypes['DeletePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type EventResolvers<ContextType = any, ParentType extends ResolversParentTypes['Event'] = ResolversParentTypes['Event']> = {
  __resolveType: TypeResolveFn<'IncomingPaymentEvent' | 'OutgoingPaymentEvent' | 'WebMonetizationEvent', ParentType, ContextType>;
};

export type EventEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['EventEdge'] = ResolversParentTypes['EventEdge']> = {
  node?: Resolver<ResolversTypes['Event'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type EventsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['EventsConnection'] = ResolversParentTypes['EventsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['EventEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HttpResolvers<ContextType = any, ParentType extends ResolversParentTypes['Http'] = ResolversParentTypes['Http']> = {
  outgoing?: Resolver<ResolversTypes['HttpOutgoing'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HttpOutgoingResolvers<ContextType = any, ParentType extends ResolversParentTypes['HttpOutgoing'] = ResolversParentTypes['HttpOutgoing']> = {
  authToken?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  endpoint?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPayment'] = ResolversParentTypes['IncomingPayment']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  completed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  externalRef?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentConnection'] = ResolversParentTypes['IncomingPaymentConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['IncomingPaymentEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentEdge'] = ResolversParentTypes['IncomingPaymentEdge']> = {
  node?: Resolver<ResolversTypes['IncomingPayment'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentEventResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentEvent'] = ResolversParentTypes['IncomingPaymentEvent']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['IncomingPaymentEventType'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['IncomingPaymentEventData'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentEventDataResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentEventData'] = ResolversParentTypes['IncomingPaymentEventData']> = {
  incomingPayment?: Resolver<ResolversTypes['IncomingPayment'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LiquidityMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['LiquidityMutationResponse'] = ResolversParentTypes['LiquidityMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['LiquidityError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ModelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Model'] = ResolversParentTypes['Model']> = {
  __resolveType: TypeResolveFn<'Account' | 'ApiKey' | 'Asset' | 'IncomingPayment' | 'IncomingPaymentEvent' | 'OutgoingPayment' | 'OutgoingPaymentEvent' | 'Peer' | 'WebMonetizationEvent', ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createAccount?: Resolver<ResolversTypes['CreateAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAccountArgs, 'input'>>;
  triggerAccountEvents?: Resolver<ResolversTypes['TriggerAccountEventsMutationResponse'], ParentType, ContextType, RequireFields<MutationTriggerAccountEventsArgs, 'limit'>>;
  createAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAssetArgs, 'input'>>;
  updateAssetWithdrawalThreshold?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateAssetWithdrawalThresholdArgs, 'input'>>;
  createPeer?: Resolver<ResolversTypes['CreatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePeerArgs, 'input'>>;
  updatePeer?: Resolver<ResolversTypes['UpdatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdatePeerArgs, 'input'>>;
  deletePeer?: Resolver<ResolversTypes['DeletePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationDeletePeerArgs, 'id'>>;
  addPeerLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddPeerLiquidityArgs, 'input'>>;
  addAssetLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddAssetLiquidityArgs, 'input'>>;
  createPeerLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePeerLiquidityWithdrawalArgs, 'input'>>;
  createAssetLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateAssetLiquidityWithdrawalArgs, 'input'>>;
  createAccountWithdrawal?: Resolver<Maybe<ResolversTypes['AccountWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateAccountWithdrawalArgs, 'input'>>;
  finalizeLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationFinalizeLiquidityWithdrawalArgs, 'withdrawalId'>>;
  rollbackLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationRollbackLiquidityWithdrawalArgs, 'withdrawalId'>>;
  createQuote?: Resolver<ResolversTypes['QuoteResponse'], ParentType, ContextType, RequireFields<MutationCreateQuoteArgs, 'input'>>;
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  depositEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositEventLiquidityArgs, 'eventId'>>;
  withdrawEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationWithdrawEventLiquidityArgs, 'eventId'>>;
  createApiKey?: Resolver<Maybe<ResolversTypes['CreateApiKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateApiKeyArgs, 'input'>>;
  deleteAllApiKeys?: Resolver<Maybe<ResolversTypes['DeleteAllApiKeysMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteAllApiKeysArgs, 'input'>>;
  redeemApiKey?: Resolver<Maybe<ResolversTypes['RedeemApiKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRedeemApiKeyArgs, 'input'>>;
  refreshSession?: Resolver<Maybe<ResolversTypes['RefreshSessionMutationResponse']>, ParentType, ContextType, RequireFields<MutationRefreshSessionArgs, 'input'>>;
  revokeSession?: Resolver<Maybe<ResolversTypes['RevokeSessionMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeSessionArgs, 'input'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'AccountWithdrawalMutationResponse' | 'AssetMutationResponse' | 'CreateAccountMutationResponse' | 'CreateApiKeyMutationResponse' | 'CreatePeerMutationResponse' | 'DeleteAllApiKeysMutationResponse' | 'DeletePeerMutationResponse' | 'LiquidityMutationResponse' | 'RedeemApiKeyMutationResponse' | 'RefreshSessionMutationResponse' | 'RevokeSessionMutationResponse' | 'TransferMutationResponse' | 'TriggerAccountEventsMutationResponse' | 'UpdatePeerMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['OutgoingPaymentState'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  sendAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  externalRef?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  sentAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentConnection'] = ResolversParentTypes['OutgoingPaymentConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['OutgoingPaymentEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentEdge'] = ResolversParentTypes['OutgoingPaymentEdge']> = {
  node?: Resolver<ResolversTypes['OutgoingPayment'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentEventResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentEvent'] = ResolversParentTypes['OutgoingPaymentEvent']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['OutgoingPaymentEventType'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['OutgoingPaymentEventData'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentEventDataResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentEventData'] = ResolversParentTypes['OutgoingPaymentEventData']> = {
  outgoingPayment?: Resolver<ResolversTypes['OutgoingPayment'], ParentType, ContextType>;
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

export type PeerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Peer'] = ResolversParentTypes['Peer']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  http?: Resolver<ResolversTypes['Http'], ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  staticIlpAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeerEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['PeerEdge'] = ResolversParentTypes['PeerEdge']> = {
  node?: Resolver<ResolversTypes['Peer'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeersConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['PeersConnection'] = ResolversParentTypes['PeersConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['PeerEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType, RequireFields<QueryAccountArgs, 'id'>>;
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType, RequireFields<QueryAssetArgs, 'id'>>;
  assets?: Resolver<ResolversTypes['AssetsConnection'], ParentType, ContextType, Partial<QueryAssetsArgs>>;
  events?: Resolver<ResolversTypes['EventsConnection'], ParentType, ContextType, Partial<QueryEventsArgs>>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType, RequireFields<QueryPeerArgs, 'id'>>;
  peers?: Resolver<ResolversTypes['PeersConnection'], ParentType, ContextType, Partial<QueryPeersArgs>>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType, RequireFields<QueryQuoteArgs, 'id'>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
};

export type QuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['Quote'] = ResolversParentTypes['Quote']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sendAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  minExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  lowEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  highEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteConnection'] = ResolversParentTypes['QuoteConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['QuoteEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteEdge'] = ResolversParentTypes['QuoteEdge']> = {
  node?: Resolver<ResolversTypes['Quote'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteResponse'] = ResolversParentTypes['QuoteResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RedeemApiKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RedeemApiKeyMutationResponse'] = ResolversParentTypes['RedeemApiKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RefreshSessionMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RefreshSessionMutationResponse'] = ResolversParentTypes['RefreshSessionMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RevokeSessionMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeSessionMutationResponse'] = ResolversParentTypes['RevokeSessionMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Session'] = ResolversParentTypes['Session']> = {
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TransferMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TransferMutationResponse'] = ResolversParentTypes['TransferMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TriggerAccountEventsMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TriggerAccountEventsMutationResponse'] = ResolversParentTypes['TriggerAccountEventsMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  count?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type UpdatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdatePeerMutationResponse'] = ResolversParentTypes['UpdatePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebMonetizationResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebMonetization'] = ResolversParentTypes['WebMonetization']> = {
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  amount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebMonetizationEventResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebMonetizationEvent'] = ResolversParentTypes['WebMonetizationEvent']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['WebMonetizationEventType'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['WebMonetizationEventData'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebMonetizationEventDataResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebMonetizationEventData'] = ResolversParentTypes['WebMonetizationEventData']> = {
  webMonetization?: Resolver<ResolversTypes['WebMonetization'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Account?: AccountResolvers<ContextType>;
  AccountWithdrawal?: AccountWithdrawalResolvers<ContextType>;
  AccountWithdrawalMutationResponse?: AccountWithdrawalMutationResponseResolvers<ContextType>;
  Amount?: AmountResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  AssetEdge?: AssetEdgeResolvers<ContextType>;
  AssetMutationResponse?: AssetMutationResponseResolvers<ContextType>;
  AssetsConnection?: AssetsConnectionResolvers<ContextType>;
  CreateAccountMutationResponse?: CreateAccountMutationResponseResolvers<ContextType>;
  CreateApiKeyMutationResponse?: CreateApiKeyMutationResponseResolvers<ContextType>;
  CreatePeerMutationResponse?: CreatePeerMutationResponseResolvers<ContextType>;
  DeleteAllApiKeysMutationResponse?: DeleteAllApiKeysMutationResponseResolvers<ContextType>;
  DeletePeerMutationResponse?: DeletePeerMutationResponseResolvers<ContextType>;
  Event?: EventResolvers<ContextType>;
  EventEdge?: EventEdgeResolvers<ContextType>;
  EventsConnection?: EventsConnectionResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  IncomingPayment?: IncomingPaymentResolvers<ContextType>;
  IncomingPaymentConnection?: IncomingPaymentConnectionResolvers<ContextType>;
  IncomingPaymentEdge?: IncomingPaymentEdgeResolvers<ContextType>;
  IncomingPaymentEvent?: IncomingPaymentEventResolvers<ContextType>;
  IncomingPaymentEventData?: IncomingPaymentEventDataResolvers<ContextType>;
  LiquidityMutationResponse?: LiquidityMutationResponseResolvers<ContextType>;
  Model?: ModelResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentConnection?: OutgoingPaymentConnectionResolvers<ContextType>;
  OutgoingPaymentEdge?: OutgoingPaymentEdgeResolvers<ContextType>;
  OutgoingPaymentEvent?: OutgoingPaymentEventResolvers<ContextType>;
  OutgoingPaymentEventData?: OutgoingPaymentEventDataResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Peer?: PeerResolvers<ContextType>;
  PeerEdge?: PeerEdgeResolvers<ContextType>;
  PeersConnection?: PeersConnectionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Quote?: QuoteResolvers<ContextType>;
  QuoteConnection?: QuoteConnectionResolvers<ContextType>;
  QuoteEdge?: QuoteEdgeResolvers<ContextType>;
  QuoteResponse?: QuoteResponseResolvers<ContextType>;
  RedeemApiKeyMutationResponse?: RedeemApiKeyMutationResponseResolvers<ContextType>;
  RefreshSessionMutationResponse?: RefreshSessionMutationResponseResolvers<ContextType>;
  RevokeSessionMutationResponse?: RevokeSessionMutationResponseResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  TriggerAccountEventsMutationResponse?: TriggerAccountEventsMutationResponseResolvers<ContextType>;
  UInt64?: GraphQLScalarType;
  UpdatePeerMutationResponse?: UpdatePeerMutationResponseResolvers<ContextType>;
  WebMonetization?: WebMonetizationResolvers<ContextType>;
  WebMonetizationEvent?: WebMonetizationEventResolvers<ContextType>;
  WebMonetizationEventData?: WebMonetizationEventDataResolvers<ContextType>;
};

export type DirectiveResolvers<ContextType = any> = {
  auth?: AuthDirectiveResolver<any, any, ContextType>;
  isAdmin?: IsAdminDirectiveResolver<any, any, ContextType>;
};
