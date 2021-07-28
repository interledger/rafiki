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

export type Amount = {
  __typename?: 'Amount';
  amount: Scalars['Int'];
  currency: Scalars['String'];
  scale: Scalars['Int'];
};

export type Asset = {
  __typename?: 'Asset';
  currency: Scalars['String'];
  scale: Scalars['Int'];
};

export type Balance = {
  __typename?: 'Balance';
  id: Scalars['ID'];
  createdTime: Scalars['String'];
  asset: Asset;
  balance: Scalars['Int'];
  netLiability?: Maybe<Scalars['Int']>;
  netAssets?: Maybe<Scalars['Int']>;
  creditExtended: Scalars['Int'];
  totalLent: Scalars['Int'];
  operator?: Maybe<Operator>;
};

export type CreateDepositMutationResponse = MutationResponse & {
  __typename?: 'CreateDepositMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  deposit: Deposit;
};

export type CreateIlpAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateIlpAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount: IlpAccount;
};

export type CreateIlpSubAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateIlpSubAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount: IlpAccount;
};

export type CreateWebhookMutationResponse = MutationResponse & {
  __typename?: 'CreateWebhookMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  webhook: Webhook;
};

export type CreateWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'CreateWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  withdrawal: Withdrawal;
};

export type DeleteIlpAccountMutationResponse = MutationResponse & {
  __typename?: 'DeleteIlpAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type DeleteWebhookMutationResponse = MutationResponse & {
  __typename?: 'DeleteWebhookMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Deposit = {
  __typename?: 'Deposit';
  id: Scalars['ID'];
  amount: Scalars['Int'];
  createdTime: Scalars['Int'];
};

export type DepositEdge = {
  __typename?: 'DepositEdge';
  node: Deposit;
  cursor: Scalars['String'];
};

export type DepositsConnection = {
  __typename?: 'DepositsConnection';
  pageInfo: PageInfo;
  edges: Array<DepositEdge>;
};

export type ExtendTrustlineMutationResponse = MutationResponse & {
  __typename?: 'ExtendTrustlineMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  trustline: Trustline;
};

export type FinalizePendingWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'FinalizePendingWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Http = {
  __typename?: 'Http';
  incoming: HttpIncoming;
  outgoing: HttpOutgoing;
};

export type HttpIncoming = {
  __typename?: 'HttpIncoming';
  authTokens: Array<Scalars['String']>;
};

export type HttpOutgoing = {
  __typename?: 'HttpOutgoing';
  authTokens: Scalars['String'];
  endpoint: Scalars['String'];
};

export type IlpAccount = {
  __typename?: 'IlpAccount';
  id: Scalars['ID'];
  enabled: Scalars['Boolean'];
  superAccount?: Maybe<IlpAccount>;
  subAccounts: IlpAccountsConnection;
  liquidityAccountId?: Maybe<Scalars['ID']>;
  maxPacketAmount: Scalars['String'];
  http: Http;
  asset: Asset;
  stream: Stream;
  routing: Routing;
  balance: Balance;
  webhooks: WebhooksConnection;
  deposits: DepositsConnection;
  withdrawals: WithdrawalsConnection;
};


export type IlpAccountSubAccountsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type IlpAccountWebhooksArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type IlpAccountDepositsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type IlpAccountWithdrawalsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};

export type IlpAccountEdge = {
  __typename?: 'IlpAccountEdge';
  node: IlpAccount;
  cursor: Scalars['String'];
};

export type IlpAccountsConnection = {
  __typename?: 'IlpAccountsConnection';
  pageInfo: PageInfo;
  edges: Array<IlpAccountEdge>;
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Create Interledger account */
  createIlpAccount: CreateIlpAccountMutationResponse;
  /** Update Interledger account */
  updateIlpAccount: UpdateIlpAccountMutationResponse;
  /** Delete Interledger account */
  deleteIlpAccount: DeleteIlpAccountMutationResponse;
  /** Create Interledger sub-account */
  createIlpSubAccount: CreateIlpSubAccountMutationResponse;
  /** Transfer between Interledger accounts */
  transfer?: Maybe<TransferMutationResponse>;
  /** Provision trustline */
  provisionTrustline?: Maybe<ProvisionTrustlineMutationResponse>;
  /** Extend Trustline */
  extendTrustline?: Maybe<ExtendTrustlineMutationResponse>;
  /** Revoke trustline */
  revokeTrustline?: Maybe<RevokeTrustlineMutationResponse>;
  /** Utilize trustline */
  utilizeTrustline?: Maybe<UtilizeTrustlineMutationResponse>;
  /** Settle trustline */
  settleTrustline?: Maybe<SettleTrustlineMutationResponse>;
  /** Create webhook */
  createWebhook?: Maybe<CreateWebhookMutationResponse>;
  /** Update webhook */
  updateWebhook?: Maybe<UpdateWebhookMutationResponse>;
  /** Delete webhook */
  deleteWebhook?: Maybe<DeleteWebhookMutationResponse>;
  /** Create deposit */
  createDeposit?: Maybe<CreateDepositMutationResponse>;
  /** Create withdrawal */
  createWithdrawal?: Maybe<CreateWithdrawalMutationResponse>;
  /** Finalize pending withdrawal */
  finalizePendingWithdrawal?: Maybe<FinalizePendingWithdrawalMutationResponse>;
  /** Rollback pending withdrawal */
  rollbackPendingWithdrawal?: Maybe<RollbackPendingWithdrawalMutationResponse>;
};


export type MutationCreateIlpSubAccountArgs = {
  superAccountId: Scalars['ID'];
};


export type MutationTransferArgs = {
  originAmount: Scalars['Int'];
  originAccountId: Scalars['ID'];
  destinationAccountId: Scalars['ID'];
  destinationAmount?: Maybe<Scalars['Int']>;
  autoCommit?: Maybe<Scalars['Boolean']>;
  idempotencyKey: Scalars['ID'];
};


export type MutationExtendTrustlineArgs = {
  trustlineId: Scalars['ID'];
  amount: Scalars['Int'];
  autoApply?: Scalars['Boolean'];
};


export type MutationRevokeTrustlineArgs = {
  trustlineId: Scalars['ID'];
  amount: Scalars['Int'];
};


export type MutationUtilizeTrustlineArgs = {
  trustlineId: Scalars['ID'];
  amount: Scalars['Int'];
};


export type MutationSettleTrustlineArgs = {
  trustlineId: Scalars['ID'];
  amount: Scalars['Int'];
  autoApply?: Scalars['Boolean'];
};


export type MutationCreateWebhookArgs = {
  ilpAccountId: Scalars['ID'];
};


export type MutationUpdateWebhookArgs = {
  webhookId: Scalars['ID'];
};


export type MutationDeleteWebhookArgs = {
  webhookId: Scalars['ID'];
};


export type MutationCreateDepositArgs = {
  ilpAccountId: Scalars['ID'];
  amount: Scalars['Int'];
};


export type MutationCreateWithdrawalArgs = {
  ilpAccountId: Scalars['ID'];
  amount: Scalars['Int'];
};


export type MutationFinalizePendingWithdrawalArgs = {
  withdrawalId: Scalars['ID'];
};


export type MutationRollbackPendingWithdrawalArgs = {
  withdrawalId: Scalars['ID'];
};

export type MutationResponse = {
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Operator = {
  __typename?: 'Operator';
  trustlineId: Scalars['ID'];
  availableCredit: Scalars['Int'];
  totalBorrowed: Scalars['Int'];
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

export type ProvisionTrustlineMutationResponse = MutationResponse & {
  __typename?: 'ProvisionTrustlineMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  trustline: Trustline;
};

export type Query = {
  __typename?: 'Query';
  /** Fetch a page of Interledger accounts. */
  ilpAccounts: IlpAccountsConnection;
  /** Get an Interledger account by ID. */
  ilpAccount: IlpAccount;
  /** Get a trustline by ID. */
  trustline: Trustline;
  /** Get a webhook by ID. */
  webhook: Webhook;
  /** Get a deposit by ID. */
  deposit: Deposit;
  /** Get a withdrawal by ID. */
  withdrawal: Withdrawal;
};


export type QueryIlpAccountsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type QueryIlpAccountArgs = {
  id: Scalars['ID'];
};


export type QueryTrustlineArgs = {
  id: Scalars['ID'];
};


export type QueryWebhookArgs = {
  id: Scalars['ID'];
};


export type QueryDepositArgs = {
  id: Scalars['ID'];
};


export type QueryWithdrawalArgs = {
  id: Scalars['ID'];
};

export type RevokeTrustlineMutationResponse = MutationResponse & {
  __typename?: 'RevokeTrustlineMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type RollbackPendingWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'RollbackPendingWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Routing = {
  __typename?: 'Routing';
  staticIlpAddress: Scalars['String'];
  inheritFromRemote: Scalars['Boolean'];
  dynamicIlpAddress?: Maybe<Scalars['String']>;
};

export type SettleTrustlineMutationResponse = MutationResponse & {
  __typename?: 'SettleTrustlineMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Stream = {
  __typename?: 'Stream';
  enabled: Scalars['Boolean'];
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Trustline = {
  __typename?: 'Trustline';
  id: Scalars['ID'];
  createdTime: Scalars['Int'];
  creditorAccountId?: Maybe<Scalars['ID']>;
  debtorAccountId: Scalars['ID'];
  availableCredit: Scalars['Int'];
  debtBalance: Scalars['Int'];
};

export type UpdateIlpAccountMutationResponse = MutationResponse & {
  __typename?: 'UpdateIlpAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount: IlpAccount;
};

export type UpdateWebhookMutationResponse = MutationResponse & {
  __typename?: 'UpdateWebhookMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  webhook: Webhook;
};

export type UtilizeTrustlineMutationResponse = MutationResponse & {
  __typename?: 'UtilizeTrustlineMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type Webhook = {
  __typename?: 'Webhook';
  id: Scalars['ID'];
};

export type WebhookEdge = {
  __typename?: 'WebhookEdge';
  node: Webhook;
  cursor: Scalars['String'];
};

export type WebhooksConnection = {
  __typename?: 'WebhooksConnection';
  pageInfo: PageInfo;
  edges: Array<WebhookEdge>;
};

export type Withdrawal = {
  __typename?: 'Withdrawal';
  id: Scalars['ID'];
  amount: Scalars['Int'];
  createdTime: Scalars['Int'];
  finalizedTime?: Maybe<Scalars['Int']>;
};

export type WithdrawalEdge = {
  __typename?: 'WithdrawalEdge';
  node: Withdrawal;
  cursor: Scalars['String'];
};

export type WithdrawalsConnection = {
  __typename?: 'WithdrawalsConnection';
  pageInfo: PageInfo;
  edges: Array<WithdrawalEdge>;
};



export type ResolverTypeWrapper<T> = Promise<T>;


export type ResolverWithResolve<TResult, TParent, TContext, TArgs> = {
  resolve: ResolverFn<TResult, TParent, TContext, TArgs>;
};

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
  | ResolverWithResolve<TResult, TParent, TContext, TArgs>
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
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  Balance: ResolverTypeWrapper<Partial<Balance>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  CreateDepositMutationResponse: ResolverTypeWrapper<Partial<CreateDepositMutationResponse>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  CreateIlpAccountMutationResponse: ResolverTypeWrapper<Partial<CreateIlpAccountMutationResponse>>;
  CreateIlpSubAccountMutationResponse: ResolverTypeWrapper<Partial<CreateIlpSubAccountMutationResponse>>;
  CreateWebhookMutationResponse: ResolverTypeWrapper<Partial<CreateWebhookMutationResponse>>;
  CreateWithdrawalMutationResponse: ResolverTypeWrapper<Partial<CreateWithdrawalMutationResponse>>;
  DeleteIlpAccountMutationResponse: ResolverTypeWrapper<Partial<DeleteIlpAccountMutationResponse>>;
  DeleteWebhookMutationResponse: ResolverTypeWrapper<Partial<DeleteWebhookMutationResponse>>;
  Deposit: ResolverTypeWrapper<Partial<Deposit>>;
  DepositEdge: ResolverTypeWrapper<Partial<DepositEdge>>;
  DepositsConnection: ResolverTypeWrapper<Partial<DepositsConnection>>;
  ExtendTrustlineMutationResponse: ResolverTypeWrapper<Partial<ExtendTrustlineMutationResponse>>;
  FinalizePendingWithdrawalMutationResponse: ResolverTypeWrapper<Partial<FinalizePendingWithdrawalMutationResponse>>;
  Http: ResolverTypeWrapper<Partial<Http>>;
  HttpIncoming: ResolverTypeWrapper<Partial<HttpIncoming>>;
  HttpOutgoing: ResolverTypeWrapper<Partial<HttpOutgoing>>;
  IlpAccount: ResolverTypeWrapper<Partial<IlpAccount>>;
  IlpAccountEdge: ResolverTypeWrapper<Partial<IlpAccountEdge>>;
  IlpAccountsConnection: ResolverTypeWrapper<Partial<IlpAccountsConnection>>;
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['CreateDepositMutationResponse'] | ResolversTypes['CreateIlpAccountMutationResponse'] | ResolversTypes['CreateIlpSubAccountMutationResponse'] | ResolversTypes['CreateWebhookMutationResponse'] | ResolversTypes['CreateWithdrawalMutationResponse'] | ResolversTypes['DeleteIlpAccountMutationResponse'] | ResolversTypes['DeleteWebhookMutationResponse'] | ResolversTypes['ExtendTrustlineMutationResponse'] | ResolversTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversTypes['ProvisionTrustlineMutationResponse'] | ResolversTypes['RevokeTrustlineMutationResponse'] | ResolversTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversTypes['SettleTrustlineMutationResponse'] | ResolversTypes['TransferMutationResponse'] | ResolversTypes['UpdateIlpAccountMutationResponse'] | ResolversTypes['UpdateWebhookMutationResponse'] | ResolversTypes['UtilizeTrustlineMutationResponse'];
  Operator: ResolverTypeWrapper<Partial<Operator>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  ProvisionTrustlineMutationResponse: ResolverTypeWrapper<Partial<ProvisionTrustlineMutationResponse>>;
  Query: ResolverTypeWrapper<{}>;
  RevokeTrustlineMutationResponse: ResolverTypeWrapper<Partial<RevokeTrustlineMutationResponse>>;
  RollbackPendingWithdrawalMutationResponse: ResolverTypeWrapper<Partial<RollbackPendingWithdrawalMutationResponse>>;
  Routing: ResolverTypeWrapper<Partial<Routing>>;
  SettleTrustlineMutationResponse: ResolverTypeWrapper<Partial<SettleTrustlineMutationResponse>>;
  Stream: ResolverTypeWrapper<Partial<Stream>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  Trustline: ResolverTypeWrapper<Partial<Trustline>>;
  UpdateIlpAccountMutationResponse: ResolverTypeWrapper<Partial<UpdateIlpAccountMutationResponse>>;
  UpdateWebhookMutationResponse: ResolverTypeWrapper<Partial<UpdateWebhookMutationResponse>>;
  UtilizeTrustlineMutationResponse: ResolverTypeWrapper<Partial<UtilizeTrustlineMutationResponse>>;
  Webhook: ResolverTypeWrapper<Partial<Webhook>>;
  WebhookEdge: ResolverTypeWrapper<Partial<WebhookEdge>>;
  WebhooksConnection: ResolverTypeWrapper<Partial<WebhooksConnection>>;
  Withdrawal: ResolverTypeWrapper<Partial<Withdrawal>>;
  WithdrawalEdge: ResolverTypeWrapper<Partial<WithdrawalEdge>>;
  WithdrawalsConnection: ResolverTypeWrapper<Partial<WithdrawalsConnection>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Amount: Partial<Amount>;
  Int: Partial<Scalars['Int']>;
  String: Partial<Scalars['String']>;
  Asset: Partial<Asset>;
  Balance: Partial<Balance>;
  ID: Partial<Scalars['ID']>;
  CreateDepositMutationResponse: Partial<CreateDepositMutationResponse>;
  Boolean: Partial<Scalars['Boolean']>;
  CreateIlpAccountMutationResponse: Partial<CreateIlpAccountMutationResponse>;
  CreateIlpSubAccountMutationResponse: Partial<CreateIlpSubAccountMutationResponse>;
  CreateWebhookMutationResponse: Partial<CreateWebhookMutationResponse>;
  CreateWithdrawalMutationResponse: Partial<CreateWithdrawalMutationResponse>;
  DeleteIlpAccountMutationResponse: Partial<DeleteIlpAccountMutationResponse>;
  DeleteWebhookMutationResponse: Partial<DeleteWebhookMutationResponse>;
  Deposit: Partial<Deposit>;
  DepositEdge: Partial<DepositEdge>;
  DepositsConnection: Partial<DepositsConnection>;
  ExtendTrustlineMutationResponse: Partial<ExtendTrustlineMutationResponse>;
  FinalizePendingWithdrawalMutationResponse: Partial<FinalizePendingWithdrawalMutationResponse>;
  Http: Partial<Http>;
  HttpIncoming: Partial<HttpIncoming>;
  HttpOutgoing: Partial<HttpOutgoing>;
  IlpAccount: Partial<IlpAccount>;
  IlpAccountEdge: Partial<IlpAccountEdge>;
  IlpAccountsConnection: Partial<IlpAccountsConnection>;
  Mutation: {};
  MutationResponse: ResolversParentTypes['CreateDepositMutationResponse'] | ResolversParentTypes['CreateIlpAccountMutationResponse'] | ResolversParentTypes['CreateIlpSubAccountMutationResponse'] | ResolversParentTypes['CreateWebhookMutationResponse'] | ResolversParentTypes['CreateWithdrawalMutationResponse'] | ResolversParentTypes['DeleteIlpAccountMutationResponse'] | ResolversParentTypes['DeleteWebhookMutationResponse'] | ResolversParentTypes['ExtendTrustlineMutationResponse'] | ResolversParentTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversParentTypes['ProvisionTrustlineMutationResponse'] | ResolversParentTypes['RevokeTrustlineMutationResponse'] | ResolversParentTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversParentTypes['SettleTrustlineMutationResponse'] | ResolversParentTypes['TransferMutationResponse'] | ResolversParentTypes['UpdateIlpAccountMutationResponse'] | ResolversParentTypes['UpdateWebhookMutationResponse'] | ResolversParentTypes['UtilizeTrustlineMutationResponse'];
  Operator: Partial<Operator>;
  PageInfo: Partial<PageInfo>;
  ProvisionTrustlineMutationResponse: Partial<ProvisionTrustlineMutationResponse>;
  Query: {};
  RevokeTrustlineMutationResponse: Partial<RevokeTrustlineMutationResponse>;
  RollbackPendingWithdrawalMutationResponse: Partial<RollbackPendingWithdrawalMutationResponse>;
  Routing: Partial<Routing>;
  SettleTrustlineMutationResponse: Partial<SettleTrustlineMutationResponse>;
  Stream: Partial<Stream>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  Trustline: Partial<Trustline>;
  UpdateIlpAccountMutationResponse: Partial<UpdateIlpAccountMutationResponse>;
  UpdateWebhookMutationResponse: Partial<UpdateWebhookMutationResponse>;
  UtilizeTrustlineMutationResponse: Partial<UtilizeTrustlineMutationResponse>;
  Webhook: Partial<Webhook>;
  WebhookEdge: Partial<WebhookEdge>;
  WebhooksConnection: Partial<WebhooksConnection>;
  Withdrawal: Partial<Withdrawal>;
  WithdrawalEdge: Partial<WithdrawalEdge>;
  WithdrawalsConnection: Partial<WithdrawalsConnection>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  currency?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BalanceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Balance'] = ResolversParentTypes['Balance']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdTime?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  netLiability?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  netAssets?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  creditExtended?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalLent?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  operator?: Resolver<Maybe<ResolversTypes['Operator']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateDepositMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateDepositMutationResponse'] = ResolversParentTypes['CreateDepositMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deposit?: Resolver<ResolversTypes['Deposit'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateIlpAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateIlpAccountMutationResponse'] = ResolversParentTypes['CreateIlpAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateIlpSubAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateIlpSubAccountMutationResponse'] = ResolversParentTypes['CreateIlpSubAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateWebhookMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateWebhookMutationResponse'] = ResolversParentTypes['CreateWebhookMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateWithdrawalMutationResponse'] = ResolversParentTypes['CreateWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  withdrawal?: Resolver<ResolversTypes['Withdrawal'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteIlpAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteIlpAccountMutationResponse'] = ResolversParentTypes['DeleteIlpAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteWebhookMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteWebhookMutationResponse'] = ResolversParentTypes['DeleteWebhookMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DepositResolvers<ContextType = any, ParentType extends ResolversParentTypes['Deposit'] = ResolversParentTypes['Deposit']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdTime?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DepositEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['DepositEdge'] = ResolversParentTypes['DepositEdge']> = {
  node?: Resolver<ResolversTypes['Deposit'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DepositsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['DepositsConnection'] = ResolversParentTypes['DepositsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['DepositEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ExtendTrustlineMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['ExtendTrustlineMutationResponse'] = ResolversParentTypes['ExtendTrustlineMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  trustline?: Resolver<ResolversTypes['Trustline'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FinalizePendingWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['FinalizePendingWithdrawalMutationResponse'] = ResolversParentTypes['FinalizePendingWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HttpResolvers<ContextType = any, ParentType extends ResolversParentTypes['Http'] = ResolversParentTypes['Http']> = {
  incoming?: Resolver<ResolversTypes['HttpIncoming'], ParentType, ContextType>;
  outgoing?: Resolver<ResolversTypes['HttpOutgoing'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HttpIncomingResolvers<ContextType = any, ParentType extends ResolversParentTypes['HttpIncoming'] = ResolversParentTypes['HttpIncoming']> = {
  authTokens?: Resolver<Array<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type HttpOutgoingResolvers<ContextType = any, ParentType extends ResolversParentTypes['HttpOutgoing'] = ResolversParentTypes['HttpOutgoing']> = {
  authTokens?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  endpoint?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IlpAccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['IlpAccount'] = ResolversParentTypes['IlpAccount']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  enabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  superAccount?: Resolver<Maybe<ResolversTypes['IlpAccount']>, ParentType, ContextType>;
  subAccounts?: Resolver<ResolversTypes['IlpAccountsConnection'], ParentType, ContextType, RequireFields<IlpAccountSubAccountsArgs, never>>;
  liquidityAccountId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  http?: Resolver<ResolversTypes['Http'], ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  stream?: Resolver<ResolversTypes['Stream'], ParentType, ContextType>;
  routing?: Resolver<ResolversTypes['Routing'], ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Balance'], ParentType, ContextType>;
  webhooks?: Resolver<ResolversTypes['WebhooksConnection'], ParentType, ContextType, RequireFields<IlpAccountWebhooksArgs, never>>;
  deposits?: Resolver<ResolversTypes['DepositsConnection'], ParentType, ContextType, RequireFields<IlpAccountDepositsArgs, never>>;
  withdrawals?: Resolver<ResolversTypes['WithdrawalsConnection'], ParentType, ContextType, RequireFields<IlpAccountWithdrawalsArgs, never>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IlpAccountEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['IlpAccountEdge'] = ResolversParentTypes['IlpAccountEdge']> = {
  node?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type IlpAccountsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['IlpAccountsConnection'] = ResolversParentTypes['IlpAccountsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['IlpAccountEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  createIlpAccount?: Resolver<ResolversTypes['CreateIlpAccountMutationResponse'], ParentType, ContextType>;
  updateIlpAccount?: Resolver<ResolversTypes['UpdateIlpAccountMutationResponse'], ParentType, ContextType>;
  deleteIlpAccount?: Resolver<ResolversTypes['DeleteIlpAccountMutationResponse'], ParentType, ContextType>;
  createIlpSubAccount?: Resolver<ResolversTypes['CreateIlpSubAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateIlpSubAccountArgs, 'superAccountId'>>;
  transfer?: Resolver<Maybe<ResolversTypes['TransferMutationResponse']>, ParentType, ContextType, RequireFields<MutationTransferArgs, 'originAmount' | 'originAccountId' | 'destinationAccountId' | 'idempotencyKey'>>;
  provisionTrustline?: Resolver<Maybe<ResolversTypes['ProvisionTrustlineMutationResponse']>, ParentType, ContextType>;
  extendTrustline?: Resolver<Maybe<ResolversTypes['ExtendTrustlineMutationResponse']>, ParentType, ContextType, RequireFields<MutationExtendTrustlineArgs, 'trustlineId' | 'amount' | 'autoApply'>>;
  revokeTrustline?: Resolver<Maybe<ResolversTypes['RevokeTrustlineMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeTrustlineArgs, 'trustlineId' | 'amount'>>;
  utilizeTrustline?: Resolver<Maybe<ResolversTypes['UtilizeTrustlineMutationResponse']>, ParentType, ContextType, RequireFields<MutationUtilizeTrustlineArgs, 'trustlineId' | 'amount'>>;
  settleTrustline?: Resolver<Maybe<ResolversTypes['SettleTrustlineMutationResponse']>, ParentType, ContextType, RequireFields<MutationSettleTrustlineArgs, 'trustlineId' | 'amount' | 'autoApply'>>;
  createWebhook?: Resolver<Maybe<ResolversTypes['CreateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWebhookArgs, 'ilpAccountId'>>;
  updateWebhook?: Resolver<Maybe<ResolversTypes['UpdateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationUpdateWebhookArgs, 'webhookId'>>;
  deleteWebhook?: Resolver<Maybe<ResolversTypes['DeleteWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteWebhookArgs, 'webhookId'>>;
  createDeposit?: Resolver<Maybe<ResolversTypes['CreateDepositMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateDepositArgs, 'ilpAccountId' | 'amount'>>;
  createWithdrawal?: Resolver<Maybe<ResolversTypes['CreateWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWithdrawalArgs, 'ilpAccountId' | 'amount'>>;
  finalizePendingWithdrawal?: Resolver<Maybe<ResolversTypes['FinalizePendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationFinalizePendingWithdrawalArgs, 'withdrawalId'>>;
  rollbackPendingWithdrawal?: Resolver<Maybe<ResolversTypes['RollbackPendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationRollbackPendingWithdrawalArgs, 'withdrawalId'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'CreateDepositMutationResponse' | 'CreateIlpAccountMutationResponse' | 'CreateIlpSubAccountMutationResponse' | 'CreateWebhookMutationResponse' | 'CreateWithdrawalMutationResponse' | 'DeleteIlpAccountMutationResponse' | 'DeleteWebhookMutationResponse' | 'ExtendTrustlineMutationResponse' | 'FinalizePendingWithdrawalMutationResponse' | 'ProvisionTrustlineMutationResponse' | 'RevokeTrustlineMutationResponse' | 'RollbackPendingWithdrawalMutationResponse' | 'SettleTrustlineMutationResponse' | 'TransferMutationResponse' | 'UpdateIlpAccountMutationResponse' | 'UpdateWebhookMutationResponse' | 'UtilizeTrustlineMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type OperatorResolvers<ContextType = any, ParentType extends ResolversParentTypes['Operator'] = ResolversParentTypes['Operator']> = {
  trustlineId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  availableCredit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  totalBorrowed?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ProvisionTrustlineMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['ProvisionTrustlineMutationResponse'] = ResolversParentTypes['ProvisionTrustlineMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  trustline?: Resolver<ResolversTypes['Trustline'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  ilpAccounts?: Resolver<ResolversTypes['IlpAccountsConnection'], ParentType, ContextType, RequireFields<QueryIlpAccountsArgs, never>>;
  ilpAccount?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType, RequireFields<QueryIlpAccountArgs, 'id'>>;
  trustline?: Resolver<ResolversTypes['Trustline'], ParentType, ContextType, RequireFields<QueryTrustlineArgs, 'id'>>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType, RequireFields<QueryWebhookArgs, 'id'>>;
  deposit?: Resolver<ResolversTypes['Deposit'], ParentType, ContextType, RequireFields<QueryDepositArgs, 'id'>>;
  withdrawal?: Resolver<ResolversTypes['Withdrawal'], ParentType, ContextType, RequireFields<QueryWithdrawalArgs, 'id'>>;
};

export type RevokeTrustlineMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeTrustlineMutationResponse'] = ResolversParentTypes['RevokeTrustlineMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RollbackPendingWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RollbackPendingWithdrawalMutationResponse'] = ResolversParentTypes['RollbackPendingWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RoutingResolvers<ContextType = any, ParentType extends ResolversParentTypes['Routing'] = ResolversParentTypes['Routing']> = {
  staticIlpAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  inheritFromRemote?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  dynamicIlpAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SettleTrustlineMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['SettleTrustlineMutationResponse'] = ResolversParentTypes['SettleTrustlineMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type StreamResolvers<ContextType = any, ParentType extends ResolversParentTypes['Stream'] = ResolversParentTypes['Stream']> = {
  enabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TransferMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TransferMutationResponse'] = ResolversParentTypes['TransferMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TrustlineResolvers<ContextType = any, ParentType extends ResolversParentTypes['Trustline'] = ResolversParentTypes['Trustline']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  createdTime?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  creditorAccountId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  debtorAccountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  availableCredit?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  debtBalance?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UpdateIlpAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateIlpAccountMutationResponse'] = ResolversParentTypes['UpdateIlpAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UpdateWebhookMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateWebhookMutationResponse'] = ResolversParentTypes['UpdateWebhookMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UtilizeTrustlineMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UtilizeTrustlineMutationResponse'] = ResolversParentTypes['UtilizeTrustlineMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhookResolvers<ContextType = any, ParentType extends ResolversParentTypes['Webhook'] = ResolversParentTypes['Webhook']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhookEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebhookEdge'] = ResolversParentTypes['WebhookEdge']> = {
  node?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhooksConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebhooksConnection'] = ResolversParentTypes['WebhooksConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['WebhookEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WithdrawalResolvers<ContextType = any, ParentType extends ResolversParentTypes['Withdrawal'] = ResolversParentTypes['Withdrawal']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  amount?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdTime?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  finalizedTime?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WithdrawalEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['WithdrawalEdge'] = ResolversParentTypes['WithdrawalEdge']> = {
  node?: Resolver<ResolversTypes['Withdrawal'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WithdrawalsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WithdrawalsConnection'] = ResolversParentTypes['WithdrawalsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['WithdrawalEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  Amount?: AmountResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  Balance?: BalanceResolvers<ContextType>;
  CreateDepositMutationResponse?: CreateDepositMutationResponseResolvers<ContextType>;
  CreateIlpAccountMutationResponse?: CreateIlpAccountMutationResponseResolvers<ContextType>;
  CreateIlpSubAccountMutationResponse?: CreateIlpSubAccountMutationResponseResolvers<ContextType>;
  CreateWebhookMutationResponse?: CreateWebhookMutationResponseResolvers<ContextType>;
  CreateWithdrawalMutationResponse?: CreateWithdrawalMutationResponseResolvers<ContextType>;
  DeleteIlpAccountMutationResponse?: DeleteIlpAccountMutationResponseResolvers<ContextType>;
  DeleteWebhookMutationResponse?: DeleteWebhookMutationResponseResolvers<ContextType>;
  Deposit?: DepositResolvers<ContextType>;
  DepositEdge?: DepositEdgeResolvers<ContextType>;
  DepositsConnection?: DepositsConnectionResolvers<ContextType>;
  ExtendTrustlineMutationResponse?: ExtendTrustlineMutationResponseResolvers<ContextType>;
  FinalizePendingWithdrawalMutationResponse?: FinalizePendingWithdrawalMutationResponseResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpIncoming?: HttpIncomingResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  IlpAccount?: IlpAccountResolvers<ContextType>;
  IlpAccountEdge?: IlpAccountEdgeResolvers<ContextType>;
  IlpAccountsConnection?: IlpAccountsConnectionResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  Operator?: OperatorResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  ProvisionTrustlineMutationResponse?: ProvisionTrustlineMutationResponseResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RevokeTrustlineMutationResponse?: RevokeTrustlineMutationResponseResolvers<ContextType>;
  RollbackPendingWithdrawalMutationResponse?: RollbackPendingWithdrawalMutationResponseResolvers<ContextType>;
  Routing?: RoutingResolvers<ContextType>;
  SettleTrustlineMutationResponse?: SettleTrustlineMutationResponseResolvers<ContextType>;
  Stream?: StreamResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  Trustline?: TrustlineResolvers<ContextType>;
  UpdateIlpAccountMutationResponse?: UpdateIlpAccountMutationResponseResolvers<ContextType>;
  UpdateWebhookMutationResponse?: UpdateWebhookMutationResponseResolvers<ContextType>;
  UtilizeTrustlineMutationResponse?: UtilizeTrustlineMutationResponseResolvers<ContextType>;
  Webhook?: WebhookResolvers<ContextType>;
  WebhookEdge?: WebhookEdgeResolvers<ContextType>;
  WebhooksConnection?: WebhooksConnectionResolvers<ContextType>;
  Withdrawal?: WithdrawalResolvers<ContextType>;
  WithdrawalEdge?: WithdrawalEdgeResolvers<ContextType>;
  WithdrawalsConnection?: WithdrawalsConnectionResolvers<ContextType>;
};


/**
 * @deprecated
 * Use "Resolvers" root object instead. If you wish to get "IResolvers", add "typesPrefix: I" to your config.
 */
export type IResolvers<ContextType = any> = Resolvers<ContextType>;
