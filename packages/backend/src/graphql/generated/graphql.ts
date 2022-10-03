import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
export type Maybe<T> = T | undefined;
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
  UInt64: bigint;
};

export type AddAssetLiquidityInput = {
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64'];
  /** The id of the asset to add liquidity. */
  assetId: Scalars['String'];
  /** The id of the transfer. */
  id: Scalars['String'];
};

export type AddKeyToClientInput = {
  clientId: Scalars['String'];
  id: Scalars['String'];
  jwk: Scalars['String'];
};

export type AddKeyToClientMutationResponse = MutationResponse & {
  __typename?: 'AddKeyToClientMutationResponse';
  client?: Maybe<Client>;
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type AddPeerLiquidityInput = {
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64'];
  /** The id of the transfer. */
  id: Scalars['String'];
  /** The id of the peer to add liquidity. */
  peerId: Scalars['String'];
};

export type Amount = {
  __typename?: 'Amount';
  assetCode: Scalars['String'];
  assetScale: Scalars['Int'];
  value: Scalars['UInt64'];
};

export type AmountInput = {
  assetCode: Scalars['String'];
  assetScale: Scalars['Int'];
  value: Scalars['UInt64'];
};

export type ApiKey = Model & {
  __typename?: 'ApiKey';
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  key: Scalars['String'];
  paymentPointerId: Scalars['String'];
  updatedAt: Scalars['String'];
};

export type Asset = Model & {
  __typename?: 'Asset';
  code: Scalars['String'];
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  scale: Scalars['Int'];
  withdrawalThreshold?: Maybe<Scalars['UInt64']>;
};

export type AssetEdge = {
  __typename?: 'AssetEdge';
  cursor: Scalars['String'];
  node: Asset;
};

export type AssetInput = {
  code: Scalars['String'];
  scale: Scalars['Int'];
};

export type AssetMutationResponse = MutationResponse & {
  __typename?: 'AssetMutationResponse';
  asset?: Maybe<Asset>;
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type AssetsConnection = {
  __typename?: 'AssetsConnection';
  edges: Array<AssetEdge>;
  pageInfo: PageInfo;
};

export type Client = Model & {
  __typename?: 'Client';
  createdAt: Scalars['String'];
  email: Scalars['String'];
  id: Scalars['ID'];
  image: Scalars['String'];
  keys: Array<ClientKeys>;
  name: Scalars['String'];
  uri: Scalars['String'];
};

export type ClientKeys = Model & {
  __typename?: 'ClientKeys';
  clientId: Scalars['String'];
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  jwk: Scalars['String'];
};

export type CreateApiKeyInput = {
  /** Payment pointer API key is created for. */
  paymentPointerId: Scalars['String'];
};

export type CreateApiKeyMutationResponse = MutationResponse & {
  __typename?: 'CreateApiKeyMutationResponse';
  apiKey?: Maybe<ApiKey>;
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type CreateAssetInput = {
  code: Scalars['String'];
  scale: Scalars['Int'];
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']>;
};

export type CreateAssetLiquidityWithdrawalInput = {
  /** Amount of withdrawal. */
  amount: Scalars['UInt64'];
  /** The id of the asset to create the withdrawal for. */
  assetId: Scalars['String'];
  /** The id of the withdrawal. */
  id: Scalars['String'];
};

export type CreateClientInput = {
  email: Scalars['String'];
  image: Scalars['String'];
  name: Scalars['String'];
  uri: Scalars['String'];
};

export type CreateClientMutationResponse = MutationResponse & {
  __typename?: 'CreateClientMutationResponse';
  client?: Maybe<Client>;
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type CreateIncomingPaymentInput = {
  description?: InputMaybe<Scalars['String']>;
  expiresAt: Scalars['String'];
  externalRef?: InputMaybe<Scalars['String']>;
  incomingAmount?: InputMaybe<AmountInput>;
  paymentPointerId: Scalars['String'];
};

export type CreateOutgoingPaymentInput = {
  description?: InputMaybe<Scalars['String']>;
  externalRef?: InputMaybe<Scalars['String']>;
  paymentPointerId: Scalars['String'];
  quoteId: Scalars['String'];
};

export type CreatePaymentPointerInput = {
  asset: AssetInput;
  publicName?: InputMaybe<Scalars['String']>;
  url: Scalars['String'];
};

export type CreatePaymentPointerMutationResponse = MutationResponse & {
  __typename?: 'CreatePaymentPointerMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  paymentPointer?: Maybe<PaymentPointer>;
  success: Scalars['Boolean'];
};

export type CreatePaymentPointerWithdrawalInput = {
  /** The id of the withdrawal. */
  id: Scalars['String'];
  /** The id of the Open Payments payment pointer to create the withdrawal for. */
  paymentPointerId: Scalars['String'];
};

export type CreatePeerInput = {
  asset: AssetInput;
  http: HttpInput;
  maxPacketAmount?: InputMaybe<Scalars['UInt64']>;
  staticIlpAddress: Scalars['String'];
};

export type CreatePeerLiquidityWithdrawalInput = {
  /** Amount of withdrawal. */
  amount: Scalars['UInt64'];
  /** The id of the withdrawal. */
  id: Scalars['String'];
  /** The id of the peer to create the withdrawal for. */
  peerId: Scalars['String'];
};

export type CreatePeerMutationResponse = MutationResponse & {
  __typename?: 'CreatePeerMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  peer?: Maybe<Peer>;
  success: Scalars['Boolean'];
};

export type CreateQuoteInput = {
  paymentPointerId: Scalars['String'];
  receiveAmount?: InputMaybe<AmountInput>;
  receiver: Scalars['String'];
  sendAmount?: InputMaybe<AmountInput>;
};

export type DeleteAllApiKeysInput = {
  /** Payment pointer API keys are deleted from. */
  paymentPointerId: Scalars['String'];
};

export type DeleteAllApiKeysMutationResponse = MutationResponse & {
  __typename?: 'DeleteAllApiKeysMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type DeletePeerMutationResponse = MutationResponse & {
  __typename?: 'DeletePeerMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
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
  createdAt: Scalars['String'];
  description?: Maybe<Scalars['String']>;
  expiresAt: Scalars['String'];
  externalRef?: Maybe<Scalars['String']>;
  id: Scalars['ID'];
  incomingAmount?: Maybe<Amount>;
  paymentPointerId: Scalars['ID'];
  receivedAmount: Amount;
  state: IncomingPaymentState;
};

export type IncomingPaymentConnection = {
  __typename?: 'IncomingPaymentConnection';
  edges: Array<IncomingPaymentEdge>;
  pageInfo: PageInfo;
};

export type IncomingPaymentEdge = {
  __typename?: 'IncomingPaymentEdge';
  cursor: Scalars['String'];
  node: IncomingPayment;
};

export type IncomingPaymentResponse = {
  __typename?: 'IncomingPaymentResponse';
  code: Scalars['String'];
  message?: Maybe<Scalars['String']>;
  payment?: Maybe<IncomingPayment>;
  success: Scalars['Boolean'];
};

export enum IncomingPaymentState {
  /** The payment is either auto-completed once the received amount equals the expected `incomingAmount`, or it is completed manually via an API call. */
  Completed = 'COMPLETED',
  /** If the payment expires before it is completed then the state will move to EXPIRED and no further payments will be accepted. */
  Expired = 'EXPIRED',
  /** The payment has a state of PENDING when it is initially created. */
  Pending = 'PENDING',
  /** As soon as payment has started (funds have cleared into the account) the state moves to PROCESSING */
  Processing = 'PROCESSING'
}

export enum LiquidityError {
  AlreadyCommitted = 'AlreadyCommitted',
  AlreadyRolledBack = 'AlreadyRolledBack',
  AmountZero = 'AmountZero',
  InsufficientBalance = 'InsufficientBalance',
  InvalidId = 'InvalidId',
  TransferExists = 'TransferExists',
  UnknownAsset = 'UnknownAsset',
  UnknownIncomingPayment = 'UnknownIncomingPayment',
  UnknownPayment = 'UnknownPayment',
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  UnknownPeer = 'UnknownPeer',
  UnknownTransfer = 'UnknownTransfer'
}

export type LiquidityMutationResponse = MutationResponse & {
  __typename?: 'LiquidityMutationResponse';
  code: Scalars['String'];
  error?: Maybe<LiquidityError>;
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type Model = {
  createdAt: Scalars['String'];
  id: Scalars['ID'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Add asset liquidity */
  addAssetLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Add Key to Client */
  addKeyToClient?: Maybe<AddKeyToClientMutationResponse>;
  /** Add peer liquidity */
  addPeerLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Create API Key */
  createApiKey?: Maybe<CreateApiKeyMutationResponse>;
  /** Create asset */
  createAsset: AssetMutationResponse;
  /** Create liquidity withdrawal from asset */
  createAssetLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create Client */
  createClient?: Maybe<CreateClientMutationResponse>;
  createIncomingPayment: IncomingPaymentResponse;
  createOutgoingPayment: OutgoingPaymentResponse;
  createPaymentPointer: CreatePaymentPointerMutationResponse;
  /** Create liquidity withdrawal from Open Payments payment pointer */
  createPaymentPointerWithdrawal?: Maybe<PaymentPointerWithdrawalMutationResponse>;
  /** Create peer */
  createPeer: CreatePeerMutationResponse;
  /** Create liquidity withdrawal from peer */
  createPeerLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  createQuote: QuoteResponse;
  /** Delete all API Keys */
  deleteAllApiKeys?: Maybe<DeleteAllApiKeysMutationResponse>;
  /** Delete peer */
  deletePeer: DeletePeerMutationResponse;
  /** Deposit webhook event liquidity */
  depositEventLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Finalize liquidity withdrawal */
  finalizeLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Redeem API Key */
  redeemApiKey?: Maybe<RedeemApiKeyMutationResponse>;
  /** Refresh Session */
  refreshSession?: Maybe<RefreshSessionMutationResponse>;
  revokeClientKey?: Maybe<RevokeClientKeyMutationResponse>;
  /** Revoke Session */
  revokeSession?: Maybe<RevokeSessionMutationResponse>;
  /** Rollback liquidity withdrawal */
  rollbackLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  triggerPaymentPointerEvents: TriggerPaymentPointerEventsMutationResponse;
  /** Update asset withdrawal threshold */
  updateAssetWithdrawalThreshold: AssetMutationResponse;
  /** Update peer */
  updatePeer: UpdatePeerMutationResponse;
  /** Withdraw webhook event liquidity */
  withdrawEventLiquidity?: Maybe<LiquidityMutationResponse>;
};


export type MutationAddAssetLiquidityArgs = {
  input: AddAssetLiquidityInput;
};


export type MutationAddKeyToClientArgs = {
  input: AddKeyToClientInput;
};


export type MutationAddPeerLiquidityArgs = {
  input: AddPeerLiquidityInput;
};


export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationCreateAssetArgs = {
  input: CreateAssetInput;
};


export type MutationCreateAssetLiquidityWithdrawalArgs = {
  input: CreateAssetLiquidityWithdrawalInput;
};


export type MutationCreateClientArgs = {
  input: CreateClientInput;
};


export type MutationCreateIncomingPaymentArgs = {
  input: CreateIncomingPaymentInput;
};


export type MutationCreateOutgoingPaymentArgs = {
  input: CreateOutgoingPaymentInput;
};


export type MutationCreatePaymentPointerArgs = {
  input: CreatePaymentPointerInput;
};


export type MutationCreatePaymentPointerWithdrawalArgs = {
  input: CreatePaymentPointerWithdrawalInput;
};


export type MutationCreatePeerArgs = {
  input: CreatePeerInput;
};


export type MutationCreatePeerLiquidityWithdrawalArgs = {
  input: CreatePeerLiquidityWithdrawalInput;
};


export type MutationCreateQuoteArgs = {
  input: CreateQuoteInput;
};


export type MutationDeleteAllApiKeysArgs = {
  input: DeleteAllApiKeysInput;
};


export type MutationDeletePeerArgs = {
  id: Scalars['String'];
};


export type MutationDepositEventLiquidityArgs = {
  eventId: Scalars['String'];
};


export type MutationFinalizeLiquidityWithdrawalArgs = {
  withdrawalId: Scalars['String'];
};


export type MutationRedeemApiKeyArgs = {
  input: RedeemApiKeyInput;
};


export type MutationRefreshSessionArgs = {
  input: RefreshSessionInput;
};


export type MutationRevokeClientKeyArgs = {
  keyId: Scalars['String'];
};


export type MutationRevokeSessionArgs = {
  input: RevokeSessionInput;
};


export type MutationRollbackLiquidityWithdrawalArgs = {
  withdrawalId: Scalars['String'];
};


export type MutationTriggerPaymentPointerEventsArgs = {
  limit: Scalars['Int'];
};


export type MutationUpdateAssetWithdrawalThresholdArgs = {
  input: UpdateAssetInput;
};


export type MutationUpdatePeerArgs = {
  input: UpdatePeerInput;
};


export type MutationWithdrawEventLiquidityArgs = {
  eventId: Scalars['String'];
};

export type MutationResponse = {
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type OutgoingPayment = Model & {
  __typename?: 'OutgoingPayment';
  createdAt: Scalars['String'];
  description?: Maybe<Scalars['String']>;
  error?: Maybe<Scalars['String']>;
  externalRef?: Maybe<Scalars['String']>;
  id: Scalars['ID'];
  paymentPointerId: Scalars['ID'];
  quote?: Maybe<Quote>;
  receiveAmount: Amount;
  receiver: Scalars['String'];
  sendAmount: Amount;
  sentAmount: Amount;
  state: OutgoingPaymentState;
  stateAttempts: Scalars['Int'];
};

export type OutgoingPaymentConnection = {
  __typename?: 'OutgoingPaymentConnection';
  edges: Array<OutgoingPaymentEdge>;
  pageInfo: PageInfo;
};

export type OutgoingPaymentEdge = {
  __typename?: 'OutgoingPaymentEdge';
  cursor: Scalars['String'];
  node: OutgoingPayment;
};

export type OutgoingPaymentResponse = {
  __typename?: 'OutgoingPaymentResponse';
  code: Scalars['String'];
  message?: Maybe<Scalars['String']>;
  payment?: Maybe<OutgoingPayment>;
  success: Scalars['Boolean'];
};

export enum OutgoingPaymentState {
  /** Successful completion */
  Completed = 'COMPLETED',
  /** Payment failed */
  Failed = 'FAILED',
  /** Will transition to SENDING once payment funds are reserved */
  Funding = 'FUNDING',
  /** Paying, will transition to COMPLETED on success */
  Sending = 'SENDING'
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

export type PaymentPointer = Model & {
  __typename?: 'PaymentPointer';
  asset: Asset;
  createdAt: Scalars['String'];
  id: Scalars['ID'];
  incomingPayments?: Maybe<IncomingPaymentConnection>;
  outgoingPayments?: Maybe<OutgoingPaymentConnection>;
  publicName?: Maybe<Scalars['String']>;
  quotes?: Maybe<QuoteConnection>;
  url: Scalars['String'];
};


export type PaymentPointerIncomingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type PaymentPointerOutgoingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};


export type PaymentPointerQuotesArgs = {
  after?: InputMaybe<Scalars['String']>;
  before?: InputMaybe<Scalars['String']>;
  first?: InputMaybe<Scalars['Int']>;
  last?: InputMaybe<Scalars['Int']>;
};

export type PaymentPointerWithdrawal = {
  __typename?: 'PaymentPointerWithdrawal';
  amount: Scalars['UInt64'];
  id: Scalars['ID'];
  paymentPointer: PaymentPointer;
};

export type PaymentPointerWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'PaymentPointerWithdrawalMutationResponse';
  code: Scalars['String'];
  error?: Maybe<LiquidityError>;
  message: Scalars['String'];
  success: Scalars['Boolean'];
  withdrawal?: Maybe<PaymentPointerWithdrawal>;
};

export type Peer = Model & {
  __typename?: 'Peer';
  asset: Asset;
  createdAt: Scalars['String'];
  http: Http;
  id: Scalars['ID'];
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  staticIlpAddress: Scalars['String'];
};

export type PeerEdge = {
  __typename?: 'PeerEdge';
  cursor: Scalars['String'];
  node: Peer;
};

export type PeersConnection = {
  __typename?: 'PeersConnection';
  edges: Array<PeerEdge>;
  pageInfo: PageInfo;
};

export type Query = {
  __typename?: 'Query';
  asset?: Maybe<Asset>;
  /** Fetch a page of assets. */
  assets: AssetsConnection;
  client?: Maybe<Client>;
  outgoingPayment?: Maybe<OutgoingPayment>;
  paymentPointer?: Maybe<PaymentPointer>;
  peer?: Maybe<Peer>;
  /** Fetch a page of peers. */
  peers: PeersConnection;
  quote?: Maybe<Quote>;
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


export type QueryClientArgs = {
  id: Scalars['String'];
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String'];
};


export type QueryPaymentPointerArgs = {
  id: Scalars['String'];
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

export type Quote = {
  __typename?: 'Quote';
  createdAt: Scalars['String'];
  expiresAt: Scalars['String'];
  highEstimatedExchangeRate: Scalars['Float'];
  id: Scalars['ID'];
  lowEstimatedExchangeRate: Scalars['Float'];
  maxPacketAmount: Scalars['UInt64'];
  minExchangeRate: Scalars['Float'];
  paymentPointerId: Scalars['ID'];
  receiveAmount: Amount;
  receiver: Scalars['String'];
  sendAmount: Amount;
};

export type QuoteConnection = {
  __typename?: 'QuoteConnection';
  edges: Array<QuoteEdge>;
  pageInfo: PageInfo;
};

export type QuoteEdge = {
  __typename?: 'QuoteEdge';
  cursor: Scalars['String'];
  node: Quote;
};

export type QuoteResponse = {
  __typename?: 'QuoteResponse';
  code: Scalars['String'];
  message?: Maybe<Scalars['String']>;
  quote?: Maybe<Quote>;
  success: Scalars['Boolean'];
};

export type RedeemApiKeyInput = {
  /** API key */
  key: Scalars['String'];
  /** Payment pointer API key was issued for. */
  paymentPointerId: Scalars['String'];
};

export type RedeemApiKeyMutationResponse = MutationResponse & {
  __typename?: 'RedeemApiKeyMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  session?: Maybe<Session>;
  success: Scalars['Boolean'];
};

export type RefreshSessionInput = {
  /** Session key */
  key: Scalars['String'];
};

export type RefreshSessionMutationResponse = MutationResponse & {
  __typename?: 'RefreshSessionMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  session?: Maybe<Session>;
  success: Scalars['Boolean'];
};

export type RevokeClientKeyMutationResponse = MutationResponse & {
  __typename?: 'RevokeClientKeyMutationResponse';
  code: Scalars['String'];
  keyId: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type RevokeSessionInput = {
  /** Session key */
  key: Scalars['String'];
};

export type RevokeSessionMutationResponse = MutationResponse & {
  __typename?: 'RevokeSessionMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type Session = {
  __typename?: 'Session';
  expiresAt: Scalars['String'];
  key: Scalars['String'];
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type TriggerPaymentPointerEventsMutationResponse = MutationResponse & {
  __typename?: 'TriggerPaymentPointerEventsMutationResponse';
  code: Scalars['String'];
  count?: Maybe<Scalars['Int']>;
  message: Scalars['String'];
  success: Scalars['Boolean'];
};

export type UpdateAssetInput = {
  id: Scalars['String'];
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']>;
};

export type UpdatePeerInput = {
  http?: InputMaybe<HttpInput>;
  id: Scalars['String'];
  maxPacketAmount?: InputMaybe<Scalars['UInt64']>;
  staticIlpAddress?: InputMaybe<Scalars['String']>;
};

export type UpdatePeerMutationResponse = MutationResponse & {
  __typename?: 'UpdatePeerMutationResponse';
  code: Scalars['String'];
  message: Scalars['String'];
  peer?: Maybe<Peer>;
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
  AddAssetLiquidityInput: ResolverTypeWrapper<Partial<AddAssetLiquidityInput>>;
  AddKeyToClientInput: ResolverTypeWrapper<Partial<AddKeyToClientInput>>;
  AddKeyToClientMutationResponse: ResolverTypeWrapper<Partial<AddKeyToClientMutationResponse>>;
  AddPeerLiquidityInput: ResolverTypeWrapper<Partial<AddPeerLiquidityInput>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  AmountInput: ResolverTypeWrapper<Partial<AmountInput>>;
  ApiKey: ResolverTypeWrapper<Partial<ApiKey>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  AssetEdge: ResolverTypeWrapper<Partial<AssetEdge>>;
  AssetInput: ResolverTypeWrapper<Partial<AssetInput>>;
  AssetMutationResponse: ResolverTypeWrapper<Partial<AssetMutationResponse>>;
  AssetsConnection: ResolverTypeWrapper<Partial<AssetsConnection>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  Client: ResolverTypeWrapper<Partial<Client>>;
  ClientKeys: ResolverTypeWrapper<Partial<ClientKeys>>;
  CreateApiKeyInput: ResolverTypeWrapper<Partial<CreateApiKeyInput>>;
  CreateApiKeyMutationResponse: ResolverTypeWrapper<Partial<CreateApiKeyMutationResponse>>;
  CreateAssetInput: ResolverTypeWrapper<Partial<CreateAssetInput>>;
  CreateAssetLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreateAssetLiquidityWithdrawalInput>>;
  CreateClientInput: ResolverTypeWrapper<Partial<CreateClientInput>>;
  CreateClientMutationResponse: ResolverTypeWrapper<Partial<CreateClientMutationResponse>>;
  CreateIncomingPaymentInput: ResolverTypeWrapper<Partial<CreateIncomingPaymentInput>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  CreatePaymentPointerInput: ResolverTypeWrapper<Partial<CreatePaymentPointerInput>>;
  CreatePaymentPointerMutationResponse: ResolverTypeWrapper<Partial<CreatePaymentPointerMutationResponse>>;
  CreatePaymentPointerWithdrawalInput: ResolverTypeWrapper<Partial<CreatePaymentPointerWithdrawalInput>>;
  CreatePeerInput: ResolverTypeWrapper<Partial<CreatePeerInput>>;
  CreatePeerLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreatePeerLiquidityWithdrawalInput>>;
  CreatePeerMutationResponse: ResolverTypeWrapper<Partial<CreatePeerMutationResponse>>;
  CreateQuoteInput: ResolverTypeWrapper<Partial<CreateQuoteInput>>;
  DeleteAllApiKeysInput: ResolverTypeWrapper<Partial<DeleteAllApiKeysInput>>;
  DeleteAllApiKeysMutationResponse: ResolverTypeWrapper<Partial<DeleteAllApiKeysMutationResponse>>;
  DeletePeerMutationResponse: ResolverTypeWrapper<Partial<DeletePeerMutationResponse>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']>>;
  Http: ResolverTypeWrapper<Partial<Http>>;
  HttpIncomingInput: ResolverTypeWrapper<Partial<HttpIncomingInput>>;
  HttpInput: ResolverTypeWrapper<Partial<HttpInput>>;
  HttpOutgoing: ResolverTypeWrapper<Partial<HttpOutgoing>>;
  HttpOutgoingInput: ResolverTypeWrapper<Partial<HttpOutgoingInput>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  IncomingPayment: ResolverTypeWrapper<Partial<IncomingPayment>>;
  IncomingPaymentConnection: ResolverTypeWrapper<Partial<IncomingPaymentConnection>>;
  IncomingPaymentEdge: ResolverTypeWrapper<Partial<IncomingPaymentEdge>>;
  IncomingPaymentResponse: ResolverTypeWrapper<Partial<IncomingPaymentResponse>>;
  IncomingPaymentState: ResolverTypeWrapper<Partial<IncomingPaymentState>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  LiquidityError: ResolverTypeWrapper<Partial<LiquidityError>>;
  LiquidityMutationResponse: ResolverTypeWrapper<Partial<LiquidityMutationResponse>>;
  Model: ResolversTypes['ApiKey'] | ResolversTypes['Asset'] | ResolversTypes['Client'] | ResolversTypes['ClientKeys'] | ResolversTypes['IncomingPayment'] | ResolversTypes['OutgoingPayment'] | ResolversTypes['PaymentPointer'] | ResolversTypes['Peer'];
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['AddKeyToClientMutationResponse'] | ResolversTypes['AssetMutationResponse'] | ResolversTypes['CreateApiKeyMutationResponse'] | ResolversTypes['CreateClientMutationResponse'] | ResolversTypes['CreatePaymentPointerMutationResponse'] | ResolversTypes['CreatePeerMutationResponse'] | ResolversTypes['DeleteAllApiKeysMutationResponse'] | ResolversTypes['DeletePeerMutationResponse'] | ResolversTypes['LiquidityMutationResponse'] | ResolversTypes['PaymentPointerWithdrawalMutationResponse'] | ResolversTypes['RedeemApiKeyMutationResponse'] | ResolversTypes['RefreshSessionMutationResponse'] | ResolversTypes['RevokeClientKeyMutationResponse'] | ResolversTypes['RevokeSessionMutationResponse'] | ResolversTypes['TransferMutationResponse'] | ResolversTypes['TriggerPaymentPointerEventsMutationResponse'] | ResolversTypes['UpdatePeerMutationResponse'];
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentConnection: ResolverTypeWrapper<Partial<OutgoingPaymentConnection>>;
  OutgoingPaymentEdge: ResolverTypeWrapper<Partial<OutgoingPaymentEdge>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  OutgoingPaymentState: ResolverTypeWrapper<Partial<OutgoingPaymentState>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentPointer: ResolverTypeWrapper<Partial<PaymentPointer>>;
  PaymentPointerWithdrawal: ResolverTypeWrapper<Partial<PaymentPointerWithdrawal>>;
  PaymentPointerWithdrawalMutationResponse: ResolverTypeWrapper<Partial<PaymentPointerWithdrawalMutationResponse>>;
  Peer: ResolverTypeWrapper<Partial<Peer>>;
  PeerEdge: ResolverTypeWrapper<Partial<PeerEdge>>;
  PeersConnection: ResolverTypeWrapper<Partial<PeersConnection>>;
  Query: ResolverTypeWrapper<{}>;
  Quote: ResolverTypeWrapper<Partial<Quote>>;
  QuoteConnection: ResolverTypeWrapper<Partial<QuoteConnection>>;
  QuoteEdge: ResolverTypeWrapper<Partial<QuoteEdge>>;
  QuoteResponse: ResolverTypeWrapper<Partial<QuoteResponse>>;
  RedeemApiKeyInput: ResolverTypeWrapper<Partial<RedeemApiKeyInput>>;
  RedeemApiKeyMutationResponse: ResolverTypeWrapper<Partial<RedeemApiKeyMutationResponse>>;
  RefreshSessionInput: ResolverTypeWrapper<Partial<RefreshSessionInput>>;
  RefreshSessionMutationResponse: ResolverTypeWrapper<Partial<RefreshSessionMutationResponse>>;
  RevokeClientKeyMutationResponse: ResolverTypeWrapper<Partial<RevokeClientKeyMutationResponse>>;
  RevokeSessionInput: ResolverTypeWrapper<Partial<RevokeSessionInput>>;
  RevokeSessionMutationResponse: ResolverTypeWrapper<Partial<RevokeSessionMutationResponse>>;
  Session: ResolverTypeWrapper<Partial<Session>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  TriggerPaymentPointerEventsMutationResponse: ResolverTypeWrapper<Partial<TriggerPaymentPointerEventsMutationResponse>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']>>;
  UpdateAssetInput: ResolverTypeWrapper<Partial<UpdateAssetInput>>;
  UpdatePeerInput: ResolverTypeWrapper<Partial<UpdatePeerInput>>;
  UpdatePeerMutationResponse: ResolverTypeWrapper<Partial<UpdatePeerMutationResponse>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AddAssetLiquidityInput: Partial<AddAssetLiquidityInput>;
  AddKeyToClientInput: Partial<AddKeyToClientInput>;
  AddKeyToClientMutationResponse: Partial<AddKeyToClientMutationResponse>;
  AddPeerLiquidityInput: Partial<AddPeerLiquidityInput>;
  Amount: Partial<Amount>;
  AmountInput: Partial<AmountInput>;
  ApiKey: Partial<ApiKey>;
  Asset: Partial<Asset>;
  AssetEdge: Partial<AssetEdge>;
  AssetInput: Partial<AssetInput>;
  AssetMutationResponse: Partial<AssetMutationResponse>;
  AssetsConnection: Partial<AssetsConnection>;
  Boolean: Partial<Scalars['Boolean']>;
  Client: Partial<Client>;
  ClientKeys: Partial<ClientKeys>;
  CreateApiKeyInput: Partial<CreateApiKeyInput>;
  CreateApiKeyMutationResponse: Partial<CreateApiKeyMutationResponse>;
  CreateAssetInput: Partial<CreateAssetInput>;
  CreateAssetLiquidityWithdrawalInput: Partial<CreateAssetLiquidityWithdrawalInput>;
  CreateClientInput: Partial<CreateClientInput>;
  CreateClientMutationResponse: Partial<CreateClientMutationResponse>;
  CreateIncomingPaymentInput: Partial<CreateIncomingPaymentInput>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  CreatePaymentPointerInput: Partial<CreatePaymentPointerInput>;
  CreatePaymentPointerMutationResponse: Partial<CreatePaymentPointerMutationResponse>;
  CreatePaymentPointerWithdrawalInput: Partial<CreatePaymentPointerWithdrawalInput>;
  CreatePeerInput: Partial<CreatePeerInput>;
  CreatePeerLiquidityWithdrawalInput: Partial<CreatePeerLiquidityWithdrawalInput>;
  CreatePeerMutationResponse: Partial<CreatePeerMutationResponse>;
  CreateQuoteInput: Partial<CreateQuoteInput>;
  DeleteAllApiKeysInput: Partial<DeleteAllApiKeysInput>;
  DeleteAllApiKeysMutationResponse: Partial<DeleteAllApiKeysMutationResponse>;
  DeletePeerMutationResponse: Partial<DeletePeerMutationResponse>;
  Float: Partial<Scalars['Float']>;
  Http: Partial<Http>;
  HttpIncomingInput: Partial<HttpIncomingInput>;
  HttpInput: Partial<HttpInput>;
  HttpOutgoing: Partial<HttpOutgoing>;
  HttpOutgoingInput: Partial<HttpOutgoingInput>;
  ID: Partial<Scalars['ID']>;
  IncomingPayment: Partial<IncomingPayment>;
  IncomingPaymentConnection: Partial<IncomingPaymentConnection>;
  IncomingPaymentEdge: Partial<IncomingPaymentEdge>;
  IncomingPaymentResponse: Partial<IncomingPaymentResponse>;
  Int: Partial<Scalars['Int']>;
  LiquidityMutationResponse: Partial<LiquidityMutationResponse>;
  Model: ResolversParentTypes['ApiKey'] | ResolversParentTypes['Asset'] | ResolversParentTypes['Client'] | ResolversParentTypes['ClientKeys'] | ResolversParentTypes['IncomingPayment'] | ResolversParentTypes['OutgoingPayment'] | ResolversParentTypes['PaymentPointer'] | ResolversParentTypes['Peer'];
  Mutation: {};
  MutationResponse: ResolversParentTypes['AddKeyToClientMutationResponse'] | ResolversParentTypes['AssetMutationResponse'] | ResolversParentTypes['CreateApiKeyMutationResponse'] | ResolversParentTypes['CreateClientMutationResponse'] | ResolversParentTypes['CreatePaymentPointerMutationResponse'] | ResolversParentTypes['CreatePeerMutationResponse'] | ResolversParentTypes['DeleteAllApiKeysMutationResponse'] | ResolversParentTypes['DeletePeerMutationResponse'] | ResolversParentTypes['LiquidityMutationResponse'] | ResolversParentTypes['PaymentPointerWithdrawalMutationResponse'] | ResolversParentTypes['RedeemApiKeyMutationResponse'] | ResolversParentTypes['RefreshSessionMutationResponse'] | ResolversParentTypes['RevokeClientKeyMutationResponse'] | ResolversParentTypes['RevokeSessionMutationResponse'] | ResolversParentTypes['TransferMutationResponse'] | ResolversParentTypes['TriggerPaymentPointerEventsMutationResponse'] | ResolversParentTypes['UpdatePeerMutationResponse'];
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentConnection: Partial<OutgoingPaymentConnection>;
  OutgoingPaymentEdge: Partial<OutgoingPaymentEdge>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  PaymentPointer: Partial<PaymentPointer>;
  PaymentPointerWithdrawal: Partial<PaymentPointerWithdrawal>;
  PaymentPointerWithdrawalMutationResponse: Partial<PaymentPointerWithdrawalMutationResponse>;
  Peer: Partial<Peer>;
  PeerEdge: Partial<PeerEdge>;
  PeersConnection: Partial<PeersConnection>;
  Query: {};
  Quote: Partial<Quote>;
  QuoteConnection: Partial<QuoteConnection>;
  QuoteEdge: Partial<QuoteEdge>;
  QuoteResponse: Partial<QuoteResponse>;
  RedeemApiKeyInput: Partial<RedeemApiKeyInput>;
  RedeemApiKeyMutationResponse: Partial<RedeemApiKeyMutationResponse>;
  RefreshSessionInput: Partial<RefreshSessionInput>;
  RefreshSessionMutationResponse: Partial<RefreshSessionMutationResponse>;
  RevokeClientKeyMutationResponse: Partial<RevokeClientKeyMutationResponse>;
  RevokeSessionInput: Partial<RevokeSessionInput>;
  RevokeSessionMutationResponse: Partial<RevokeSessionMutationResponse>;
  Session: Partial<Session>;
  String: Partial<Scalars['String']>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  TriggerPaymentPointerEventsMutationResponse: Partial<TriggerPaymentPointerEventsMutationResponse>;
  UInt64: Partial<Scalars['UInt64']>;
  UpdateAssetInput: Partial<UpdateAssetInput>;
  UpdatePeerInput: Partial<UpdatePeerInput>;
  UpdatePeerMutationResponse: Partial<UpdatePeerMutationResponse>;
};

export type AuthDirectiveArgs = { };

export type AuthDirectiveResolver<Result, Parent, ContextType = any, Args = AuthDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type IsAdminDirectiveArgs = { };

export type IsAdminDirectiveResolver<Result, Parent, ContextType = any, Args = IsAdminDirectiveArgs> = DirectiveResolverFn<Result, Parent, ContextType, Args>;

export type AddKeyToClientMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['AddKeyToClientMutationResponse'] = ResolversParentTypes['AddKeyToClientMutationResponse']> = {
  client?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  assetCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  assetScale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ApiKeyResolvers<ContextType = any, ParentType extends ResolversParentTypes['ApiKey'] = ResolversParentTypes['ApiKey']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  withdrawalThreshold?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetEdge'] = ResolversParentTypes['AssetEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetMutationResponse'] = ResolversParentTypes['AssetMutationResponse']> = {
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetsConnection'] = ResolversParentTypes['AssetsConnection']> = {
  edges?: Resolver<Array<ResolversTypes['AssetEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ClientResolvers<ContextType = any, ParentType extends ResolversParentTypes['Client'] = ResolversParentTypes['Client']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  email?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  image?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  keys?: Resolver<Array<ResolversTypes['ClientKeys']>, ParentType, ContextType>;
  name?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  uri?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ClientKeysResolvers<ContextType = any, ParentType extends ResolversParentTypes['ClientKeys'] = ResolversParentTypes['ClientKeys']> = {
  clientId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  jwk?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateApiKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateApiKeyMutationResponse'] = ResolversParentTypes['CreateApiKeyMutationResponse']> = {
  apiKey?: Resolver<Maybe<ResolversTypes['ApiKey']>, ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateClientMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateClientMutationResponse'] = ResolversParentTypes['CreateClientMutationResponse']> = {
  client?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreatePaymentPointerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreatePaymentPointerMutationResponse'] = ResolversParentTypes['CreatePaymentPointerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  paymentPointer?: Resolver<Maybe<ResolversTypes['PaymentPointer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreatePeerMutationResponse'] = ResolversParentTypes['CreatePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteAllApiKeysMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteAllApiKeysMutationResponse'] = ResolversParentTypes['DeleteAllApiKeysMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeletePeerMutationResponse'] = ResolversParentTypes['DeletePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  externalRef?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['IncomingPaymentState'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentConnection'] = ResolversParentTypes['IncomingPaymentConnection']> = {
  edges?: Resolver<Array<ResolversTypes['IncomingPaymentEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentEdge'] = ResolversParentTypes['IncomingPaymentEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['IncomingPayment'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IncomingPaymentResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['IncomingPaymentResponse'] = ResolversParentTypes['IncomingPaymentResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  payment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LiquidityMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['LiquidityMutationResponse'] = ResolversParentTypes['LiquidityMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['LiquidityError']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ModelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Model'] = ResolversParentTypes['Model']> = {
  __resolveType: TypeResolveFn<'ApiKey' | 'Asset' | 'Client' | 'ClientKeys' | 'IncomingPayment' | 'OutgoingPayment' | 'PaymentPointer' | 'Peer', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addAssetLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddAssetLiquidityArgs, 'input'>>;
  addKeyToClient?: Resolver<Maybe<ResolversTypes['AddKeyToClientMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddKeyToClientArgs, 'input'>>;
  addPeerLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddPeerLiquidityArgs, 'input'>>;
  createApiKey?: Resolver<Maybe<ResolversTypes['CreateApiKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateApiKeyArgs, 'input'>>;
  createAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAssetArgs, 'input'>>;
  createAssetLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateAssetLiquidityWithdrawalArgs, 'input'>>;
  createClient?: Resolver<Maybe<ResolversTypes['CreateClientMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateClientArgs, 'input'>>;
  createIncomingPayment?: Resolver<ResolversTypes['IncomingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateIncomingPaymentArgs, 'input'>>;
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  createPaymentPointer?: Resolver<ResolversTypes['CreatePaymentPointerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePaymentPointerArgs, 'input'>>;
  createPaymentPointerWithdrawal?: Resolver<Maybe<ResolversTypes['PaymentPointerWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePaymentPointerWithdrawalArgs, 'input'>>;
  createPeer?: Resolver<ResolversTypes['CreatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePeerArgs, 'input'>>;
  createPeerLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePeerLiquidityWithdrawalArgs, 'input'>>;
  createQuote?: Resolver<ResolversTypes['QuoteResponse'], ParentType, ContextType, RequireFields<MutationCreateQuoteArgs, 'input'>>;
  deleteAllApiKeys?: Resolver<Maybe<ResolversTypes['DeleteAllApiKeysMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteAllApiKeysArgs, 'input'>>;
  deletePeer?: Resolver<ResolversTypes['DeletePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationDeletePeerArgs, 'id'>>;
  depositEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositEventLiquidityArgs, 'eventId'>>;
  finalizeLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationFinalizeLiquidityWithdrawalArgs, 'withdrawalId'>>;
  redeemApiKey?: Resolver<Maybe<ResolversTypes['RedeemApiKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRedeemApiKeyArgs, 'input'>>;
  refreshSession?: Resolver<Maybe<ResolversTypes['RefreshSessionMutationResponse']>, ParentType, ContextType, RequireFields<MutationRefreshSessionArgs, 'input'>>;
  revokeClientKey?: Resolver<Maybe<ResolversTypes['RevokeClientKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeClientKeyArgs, 'keyId'>>;
  revokeSession?: Resolver<Maybe<ResolversTypes['RevokeSessionMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeSessionArgs, 'input'>>;
  rollbackLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationRollbackLiquidityWithdrawalArgs, 'withdrawalId'>>;
  triggerPaymentPointerEvents?: Resolver<ResolversTypes['TriggerPaymentPointerEventsMutationResponse'], ParentType, ContextType, RequireFields<MutationTriggerPaymentPointerEventsArgs, 'limit'>>;
  updateAssetWithdrawalThreshold?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateAssetWithdrawalThresholdArgs, 'input'>>;
  updatePeer?: Resolver<ResolversTypes['UpdatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdatePeerArgs, 'input'>>;
  withdrawEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationWithdrawEventLiquidityArgs, 'eventId'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'AddKeyToClientMutationResponse' | 'AssetMutationResponse' | 'CreateApiKeyMutationResponse' | 'CreateClientMutationResponse' | 'CreatePaymentPointerMutationResponse' | 'CreatePeerMutationResponse' | 'DeleteAllApiKeysMutationResponse' | 'DeletePeerMutationResponse' | 'LiquidityMutationResponse' | 'PaymentPointerWithdrawalMutationResponse' | 'RedeemApiKeyMutationResponse' | 'RefreshSessionMutationResponse' | 'RevokeClientKeyMutationResponse' | 'RevokeSessionMutationResponse' | 'TransferMutationResponse' | 'TriggerPaymentPointerEventsMutationResponse' | 'UpdatePeerMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  description?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  externalRef?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sendAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  sentAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['OutgoingPaymentState'], ParentType, ContextType>;
  stateAttempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentConnection'] = ResolversParentTypes['OutgoingPaymentConnection']> = {
  edges?: Resolver<Array<ResolversTypes['OutgoingPaymentEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentEdge'] = ResolversParentTypes['OutgoingPaymentEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['OutgoingPayment'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentResponse'] = ResolversParentTypes['OutgoingPaymentResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  payment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentPointerResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointer'] = ResolversParentTypes['PaymentPointer']> = {
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingPayments?: Resolver<Maybe<ResolversTypes['IncomingPaymentConnection']>, ParentType, ContextType, Partial<PaymentPointerIncomingPaymentsArgs>>;
  outgoingPayments?: Resolver<Maybe<ResolversTypes['OutgoingPaymentConnection']>, ParentType, ContextType, Partial<PaymentPointerOutgoingPaymentsArgs>>;
  publicName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quotes?: Resolver<Maybe<ResolversTypes['QuoteConnection']>, ParentType, ContextType, Partial<PaymentPointerQuotesArgs>>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentPointerWithdrawalResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointerWithdrawal'] = ResolversParentTypes['PaymentPointerWithdrawal']> = {
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  paymentPointer?: Resolver<ResolversTypes['PaymentPointer'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentPointerWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointerWithdrawalMutationResponse'] = ResolversParentTypes['PaymentPointerWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['LiquidityError']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  withdrawal?: Resolver<Maybe<ResolversTypes['PaymentPointerWithdrawal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Peer'] = ResolversParentTypes['Peer']> = {
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  http?: Resolver<ResolversTypes['Http'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  staticIlpAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeerEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['PeerEdge'] = ResolversParentTypes['PeerEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Peer'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeersConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['PeersConnection'] = ResolversParentTypes['PeersConnection']> = {
  edges?: Resolver<Array<ResolversTypes['PeerEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType, RequireFields<QueryAssetArgs, 'id'>>;
  assets?: Resolver<ResolversTypes['AssetsConnection'], ParentType, ContextType, Partial<QueryAssetsArgs>>;
  client?: Resolver<Maybe<ResolversTypes['Client']>, ParentType, ContextType, RequireFields<QueryClientArgs, 'id'>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
  paymentPointer?: Resolver<Maybe<ResolversTypes['PaymentPointer']>, ParentType, ContextType, RequireFields<QueryPaymentPointerArgs, 'id'>>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType, RequireFields<QueryPeerArgs, 'id'>>;
  peers?: Resolver<ResolversTypes['PeersConnection'], ParentType, ContextType, Partial<QueryPeersArgs>>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType, RequireFields<QueryQuoteArgs, 'id'>>;
};

export type QuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['Quote'] = ResolversParentTypes['Quote']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  highEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lowEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  minExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sendAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteConnection'] = ResolversParentTypes['QuoteConnection']> = {
  edges?: Resolver<Array<ResolversTypes['QuoteEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteEdge'] = ResolversParentTypes['QuoteEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Quote'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QuoteResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['QuoteResponse'] = ResolversParentTypes['QuoteResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RedeemApiKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RedeemApiKeyMutationResponse'] = ResolversParentTypes['RedeemApiKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RefreshSessionMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RefreshSessionMutationResponse'] = ResolversParentTypes['RefreshSessionMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RevokeClientKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeClientKeyMutationResponse'] = ResolversParentTypes['RevokeClientKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  keyId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RevokeSessionMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeSessionMutationResponse'] = ResolversParentTypes['RevokeSessionMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Session'] = ResolversParentTypes['Session']> = {
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TransferMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TransferMutationResponse'] = ResolversParentTypes['TransferMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TriggerPaymentPointerEventsMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TriggerPaymentPointerEventsMutationResponse'] = ResolversParentTypes['TriggerPaymentPointerEventsMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  count?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type UpdatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdatePeerMutationResponse'] = ResolversParentTypes['UpdatePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  AddKeyToClientMutationResponse?: AddKeyToClientMutationResponseResolvers<ContextType>;
  Amount?: AmountResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  AssetEdge?: AssetEdgeResolvers<ContextType>;
  AssetMutationResponse?: AssetMutationResponseResolvers<ContextType>;
  AssetsConnection?: AssetsConnectionResolvers<ContextType>;
  Client?: ClientResolvers<ContextType>;
  ClientKeys?: ClientKeysResolvers<ContextType>;
  CreateApiKeyMutationResponse?: CreateApiKeyMutationResponseResolvers<ContextType>;
  CreateClientMutationResponse?: CreateClientMutationResponseResolvers<ContextType>;
  CreatePaymentPointerMutationResponse?: CreatePaymentPointerMutationResponseResolvers<ContextType>;
  CreatePeerMutationResponse?: CreatePeerMutationResponseResolvers<ContextType>;
  DeleteAllApiKeysMutationResponse?: DeleteAllApiKeysMutationResponseResolvers<ContextType>;
  DeletePeerMutationResponse?: DeletePeerMutationResponseResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  IncomingPayment?: IncomingPaymentResolvers<ContextType>;
  IncomingPaymentConnection?: IncomingPaymentConnectionResolvers<ContextType>;
  IncomingPaymentEdge?: IncomingPaymentEdgeResolvers<ContextType>;
  IncomingPaymentResponse?: IncomingPaymentResponseResolvers<ContextType>;
  LiquidityMutationResponse?: LiquidityMutationResponseResolvers<ContextType>;
  Model?: ModelResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentConnection?: OutgoingPaymentConnectionResolvers<ContextType>;
  OutgoingPaymentEdge?: OutgoingPaymentEdgeResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentPointer?: PaymentPointerResolvers<ContextType>;
  PaymentPointerWithdrawal?: PaymentPointerWithdrawalResolvers<ContextType>;
  PaymentPointerWithdrawalMutationResponse?: PaymentPointerWithdrawalMutationResponseResolvers<ContextType>;
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
  RevokeClientKeyMutationResponse?: RevokeClientKeyMutationResponseResolvers<ContextType>;
  RevokeSessionMutationResponse?: RevokeSessionMutationResponseResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  TriggerPaymentPointerEventsMutationResponse?: TriggerPaymentPointerEventsMutationResponseResolvers<ContextType>;
  UInt64?: GraphQLScalarType;
  UpdatePeerMutationResponse?: UpdatePeerMutationResponseResolvers<ContextType>;
};

export type DirectiveResolvers<ContextType = any> = {
  auth?: AuthDirectiveResolver<any, any, ContextType>;
  isAdmin?: IsAdminDirectiveResolver<any, any, ContextType>;
};
