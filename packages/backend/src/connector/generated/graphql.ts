import { GraphQLResolveInfo, GraphQLScalarType, GraphQLScalarTypeConfig } from 'graphql';
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
  UInt64: bigint;
};

export type Asset = {
  __typename?: 'Asset';
  code: Scalars['String'];
  scale: Scalars['Int'];
};

export type AssetInput = {
  code: Scalars['String'];
  scale: Scalars['Int'];
};

export type Balance = {
  __typename?: 'Balance';
  balance: Scalars['UInt64'];
  netLiability?: Maybe<Scalars['UInt64']>;
  netAssets?: Maybe<Scalars['UInt64']>;
  creditExtended: Scalars['UInt64'];
  totalLent: Scalars['UInt64'];
  availableCredit: Scalars['UInt64'];
  totalBorrowed: Scalars['UInt64'];
};

export type CreateDepositInput = {
  /** The id of the account to create the deposit for. */
  ilpAccountId: Scalars['ID'];
  /** Amount of deposit. */
  amount: Scalars['UInt64'];
  /** The id of the deposit. */
  id?: Maybe<Scalars['ID']>;
};

export type CreateDepositMutationResponse = MutationResponse & {
  __typename?: 'CreateDepositMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  deposit?: Maybe<Deposit>;
};

export type CreateIlpAccountInput = {
  id?: Maybe<Scalars['ID']>;
  disabled?: Maybe<Scalars['Boolean']>;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<HttpInput>;
  asset: AssetInput;
  stream?: Maybe<StreamInput>;
  routing?: Maybe<RoutingInput>;
};

export type CreateIlpAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateIlpAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount?: Maybe<IlpAccount>;
};

export type CreateIlpSubAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateIlpSubAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount?: Maybe<IlpAccount>;
};

export type CreateWebhookMutationResponse = MutationResponse & {
  __typename?: 'CreateWebhookMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  webhook: Webhook;
};

export type CreateWithdrawalInput = {
  /** The id of the account to create the withdrawal for. */
  ilpAccountId: Scalars['ID'];
  /** Amount of deposit. */
  amount: Scalars['UInt64'];
  /** The id of the withdrawal. */
  id?: Maybe<Scalars['ID']>;
};

export type CreateWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'CreateWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  withdrawal?: Maybe<Withdrawal>;
  error?: Maybe<WithdrawError>;
};

export enum CreditError {
  SameAccounts = 'SameAccounts',
  UnknownAccount = 'UnknownAccount',
  UnrelatedSubAccount = 'UnrelatedSubAccount',
  UnknownSubAccount = 'UnknownSubAccount',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientCredit = 'InsufficientCredit',
  InsufficientDebt = 'InsufficientDebt'
}

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
  amount: Scalars['UInt64'];
  ilpAccountId: Scalars['ID'];
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

export type ExtendCreditInput = {
  /** Account extending credit. */
  accountId: Scalars['ID'];
  /** Sub-account to which credit is extended. */
  subAccountId: Scalars['ID'];
  /** Amount of additional line of credit. */
  amount: Scalars['UInt64'];
  /** Automatically utilized and applied to the account balance. */
  autoApply?: Scalars['Boolean'];
};

export type ExtendCreditMutationResponse = MutationResponse & {
  __typename?: 'ExtendCreditMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<CreditError>;
};

export type FinalizePendingWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'FinalizePendingWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<WithdrawError>;
};

export type Http = {
  __typename?: 'Http';
  outgoing: HttpOutgoing;
};

export type HttpIncomingInput = {
  authTokens: Array<Scalars['String']>;
};

export type HttpInput = {
  incoming: HttpIncomingInput;
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

export type IlpAccount = {
  __typename?: 'IlpAccount';
  id: Scalars['ID'];
  disabled: Scalars['Boolean'];
  superAccountId?: Maybe<Scalars['ID']>;
  superAccount?: Maybe<IlpAccount>;
  subAccounts: SubAccountsConnection;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<Http>;
  asset: Asset;
  stream: Stream;
  routing?: Maybe<Routing>;
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
  /** Extend Credit */
  extendCredit?: Maybe<ExtendCreditMutationResponse>;
  /** Revoke Credit */
  revokeCredit?: Maybe<RevokeCreditMutationResponse>;
  /** Utilize Credit */
  utilizeCredit?: Maybe<UtilizeCreditMutationResponse>;
  /** Settle Debt */
  settleDebt?: Maybe<SettleDebtMutationResponse>;
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


export type MutationCreateIlpAccountArgs = {
  input: CreateIlpAccountInput;
};


export type MutationUpdateIlpAccountArgs = {
  input: UpdateIlpAccountInput;
};


export type MutationDeleteIlpAccountArgs = {
  id: Scalars['ID'];
};


export type MutationCreateIlpSubAccountArgs = {
  superAccountId: Scalars['ID'];
};


export type MutationTransferArgs = {
  sourceAmount: Scalars['UInt64'];
  sourceAccountId: Scalars['ID'];
  destinationAccountId: Scalars['ID'];
  destinationAmount?: Maybe<Scalars['UInt64']>;
  autoCommit?: Maybe<Scalars['Boolean']>;
  idempotencyKey: Scalars['ID'];
};


export type MutationExtendCreditArgs = {
  input: ExtendCreditInput;
};


export type MutationRevokeCreditArgs = {
  input: RevokeCreditInput;
};


export type MutationUtilizeCreditArgs = {
  input: UtilizeCreditInput;
};


export type MutationSettleDebtArgs = {
  input?: Maybe<SettleDebtInput>;
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
  input: CreateDepositInput;
};


export type MutationCreateWithdrawalArgs = {
  input: CreateWithdrawalInput;
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

export type Query = {
  __typename?: 'Query';
  /** Fetch a page of Interledger accounts. */
  ilpAccounts: IlpAccountsConnection;
  /** Get an Interledger account by ID. */
  ilpAccount: IlpAccount;
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


export type QueryWebhookArgs = {
  id: Scalars['ID'];
};


export type QueryDepositArgs = {
  id: Scalars['ID'];
};


export type QueryWithdrawalArgs = {
  id: Scalars['ID'];
};

export type RevokeCreditInput = {
  /** Account revoking credit. */
  accountId: Scalars['ID'];
  /** Sub-account to which credit is revoked. */
  subAccountId: Scalars['ID'];
  /** Amount of revoked line of credit. */
  amount: Scalars['UInt64'];
};

export type RevokeCreditMutationResponse = MutationResponse & {
  __typename?: 'RevokeCreditMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<CreditError>;
};

export type RollbackPendingWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'RollbackPendingWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<WithdrawError>;
};

export type Routing = {
  __typename?: 'Routing';
  staticIlpAddress: Scalars['String'];
  inheritFromRemote?: Maybe<Scalars['Boolean']>;
  dynamicIlpAddress?: Maybe<Scalars['String']>;
};

export type RoutingInput = {
  staticIlpAddress: Scalars['String'];
};

export type SettleDebtInput = {
  /** Account collecting debt. */
  accountId: Scalars['ID'];
  /** Sub-account settling debt. */
  subAccountId: Scalars['ID'];
  /** Amount of debt. */
  amount: Scalars['UInt64'];
  /** Replenish the account's line of credit commensurate with the debt settled. */
  revolve?: Scalars['Boolean'];
};

export type SettleDebtMutationResponse = MutationResponse & {
  __typename?: 'SettleDebtMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<CreditError>;
};

export type Stream = {
  __typename?: 'Stream';
  enabled: Scalars['Boolean'];
};

export type StreamInput = {
  enabled: Scalars['Boolean'];
};

export type SubAccountsConnection = {
  __typename?: 'SubAccountsConnection';
  pageInfo: PageInfo;
  edges: Array<IlpAccountEdge>;
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};


export type UpdateIlpAccountInput = {
  id?: Maybe<Scalars['ID']>;
  disabled?: Maybe<Scalars['Boolean']>;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<HttpInput>;
  stream?: Maybe<StreamInput>;
  routing?: Maybe<RoutingInput>;
};

export type UpdateIlpAccountMutationResponse = MutationResponse & {
  __typename?: 'UpdateIlpAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  ilpAccount?: Maybe<IlpAccount>;
};

export type UpdateWebhookMutationResponse = MutationResponse & {
  __typename?: 'UpdateWebhookMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  webhook: Webhook;
};

export type UtilizeCreditInput = {
  /** Account extending credit. */
  accountId: Scalars['ID'];
  /** Sub-account to which credit is extended. */
  subAccountId: Scalars['ID'];
  /** Amount of utilized line of credit. */
  amount: Scalars['UInt64'];
};

export type UtilizeCreditMutationResponse = MutationResponse & {
  __typename?: 'UtilizeCreditMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  error?: Maybe<CreditError>;
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

export enum WithdrawError {
  AlreadyFinalized = 'AlreadyFinalized',
  AlreadyRolledBack = 'AlreadyRolledBack',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InsufficientSettlementBalance = 'InsufficientSettlementBalance',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount',
  UnknownLiquidityAccount = 'UnknownLiquidityAccount',
  UnknownSettlementAccount = 'UnknownSettlementAccount',
  UnknownWithdrawal = 'UnknownWithdrawal',
  WithdrawalExists = 'WithdrawalExists'
}

export type Withdrawal = {
  __typename?: 'Withdrawal';
  id: Scalars['ID'];
  amount: Scalars['UInt64'];
  ilpAccountId: Scalars['ID'];
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
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  AssetInput: ResolverTypeWrapper<Partial<AssetInput>>;
  Balance: ResolverTypeWrapper<Partial<Balance>>;
  CreateDepositInput: ResolverTypeWrapper<Partial<CreateDepositInput>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']>>;
  CreateDepositMutationResponse: ResolverTypeWrapper<Partial<CreateDepositMutationResponse>>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  CreateIlpAccountInput: ResolverTypeWrapper<Partial<CreateIlpAccountInput>>;
  CreateIlpAccountMutationResponse: ResolverTypeWrapper<Partial<CreateIlpAccountMutationResponse>>;
  CreateIlpSubAccountMutationResponse: ResolverTypeWrapper<Partial<CreateIlpSubAccountMutationResponse>>;
  CreateWebhookMutationResponse: ResolverTypeWrapper<Partial<CreateWebhookMutationResponse>>;
  CreateWithdrawalInput: ResolverTypeWrapper<Partial<CreateWithdrawalInput>>;
  CreateWithdrawalMutationResponse: ResolverTypeWrapper<Partial<CreateWithdrawalMutationResponse>>;
  CreditError: ResolverTypeWrapper<Partial<CreditError>>;
  DeleteIlpAccountMutationResponse: ResolverTypeWrapper<Partial<DeleteIlpAccountMutationResponse>>;
  DeleteWebhookMutationResponse: ResolverTypeWrapper<Partial<DeleteWebhookMutationResponse>>;
  Deposit: ResolverTypeWrapper<Partial<Deposit>>;
  DepositEdge: ResolverTypeWrapper<Partial<DepositEdge>>;
  DepositsConnection: ResolverTypeWrapper<Partial<DepositsConnection>>;
  ExtendCreditInput: ResolverTypeWrapper<Partial<ExtendCreditInput>>;
  ExtendCreditMutationResponse: ResolverTypeWrapper<Partial<ExtendCreditMutationResponse>>;
  FinalizePendingWithdrawalMutationResponse: ResolverTypeWrapper<Partial<FinalizePendingWithdrawalMutationResponse>>;
  Http: ResolverTypeWrapper<Partial<Http>>;
  HttpIncomingInput: ResolverTypeWrapper<Partial<HttpIncomingInput>>;
  HttpInput: ResolverTypeWrapper<Partial<HttpInput>>;
  HttpOutgoing: ResolverTypeWrapper<Partial<HttpOutgoing>>;
  HttpOutgoingInput: ResolverTypeWrapper<Partial<HttpOutgoingInput>>;
  IlpAccount: ResolverTypeWrapper<Partial<IlpAccount>>;
  IlpAccountEdge: ResolverTypeWrapper<Partial<IlpAccountEdge>>;
  IlpAccountsConnection: ResolverTypeWrapper<Partial<IlpAccountsConnection>>;
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['CreateDepositMutationResponse'] | ResolversTypes['CreateIlpAccountMutationResponse'] | ResolversTypes['CreateIlpSubAccountMutationResponse'] | ResolversTypes['CreateWebhookMutationResponse'] | ResolversTypes['CreateWithdrawalMutationResponse'] | ResolversTypes['DeleteIlpAccountMutationResponse'] | ResolversTypes['DeleteWebhookMutationResponse'] | ResolversTypes['ExtendCreditMutationResponse'] | ResolversTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversTypes['RevokeCreditMutationResponse'] | ResolversTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversTypes['SettleDebtMutationResponse'] | ResolversTypes['TransferMutationResponse'] | ResolversTypes['UpdateIlpAccountMutationResponse'] | ResolversTypes['UpdateWebhookMutationResponse'] | ResolversTypes['UtilizeCreditMutationResponse'];
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Query: ResolverTypeWrapper<{}>;
  RevokeCreditInput: ResolverTypeWrapper<Partial<RevokeCreditInput>>;
  RevokeCreditMutationResponse: ResolverTypeWrapper<Partial<RevokeCreditMutationResponse>>;
  RollbackPendingWithdrawalMutationResponse: ResolverTypeWrapper<Partial<RollbackPendingWithdrawalMutationResponse>>;
  Routing: ResolverTypeWrapper<Partial<Routing>>;
  RoutingInput: ResolverTypeWrapper<Partial<RoutingInput>>;
  SettleDebtInput: ResolverTypeWrapper<Partial<SettleDebtInput>>;
  SettleDebtMutationResponse: ResolverTypeWrapper<Partial<SettleDebtMutationResponse>>;
  Stream: ResolverTypeWrapper<Partial<Stream>>;
  StreamInput: ResolverTypeWrapper<Partial<StreamInput>>;
  SubAccountsConnection: ResolverTypeWrapper<Partial<SubAccountsConnection>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']>>;
  UpdateIlpAccountInput: ResolverTypeWrapper<Partial<UpdateIlpAccountInput>>;
  UpdateIlpAccountMutationResponse: ResolverTypeWrapper<Partial<UpdateIlpAccountMutationResponse>>;
  UpdateWebhookMutationResponse: ResolverTypeWrapper<Partial<UpdateWebhookMutationResponse>>;
  UtilizeCreditInput: ResolverTypeWrapper<Partial<UtilizeCreditInput>>;
  UtilizeCreditMutationResponse: ResolverTypeWrapper<Partial<UtilizeCreditMutationResponse>>;
  Webhook: ResolverTypeWrapper<Partial<Webhook>>;
  WebhookEdge: ResolverTypeWrapper<Partial<WebhookEdge>>;
  WebhooksConnection: ResolverTypeWrapper<Partial<WebhooksConnection>>;
  WithdrawError: ResolverTypeWrapper<Partial<WithdrawError>>;
  Withdrawal: ResolverTypeWrapper<Partial<Withdrawal>>;
  WithdrawalEdge: ResolverTypeWrapper<Partial<WithdrawalEdge>>;
  WithdrawalsConnection: ResolverTypeWrapper<Partial<WithdrawalsConnection>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Asset: Partial<Asset>;
  String: Partial<Scalars['String']>;
  Int: Partial<Scalars['Int']>;
  AssetInput: Partial<AssetInput>;
  Balance: Partial<Balance>;
  CreateDepositInput: Partial<CreateDepositInput>;
  ID: Partial<Scalars['ID']>;
  CreateDepositMutationResponse: Partial<CreateDepositMutationResponse>;
  Boolean: Partial<Scalars['Boolean']>;
  CreateIlpAccountInput: Partial<CreateIlpAccountInput>;
  CreateIlpAccountMutationResponse: Partial<CreateIlpAccountMutationResponse>;
  CreateIlpSubAccountMutationResponse: Partial<CreateIlpSubAccountMutationResponse>;
  CreateWebhookMutationResponse: Partial<CreateWebhookMutationResponse>;
  CreateWithdrawalInput: Partial<CreateWithdrawalInput>;
  CreateWithdrawalMutationResponse: Partial<CreateWithdrawalMutationResponse>;
  DeleteIlpAccountMutationResponse: Partial<DeleteIlpAccountMutationResponse>;
  DeleteWebhookMutationResponse: Partial<DeleteWebhookMutationResponse>;
  Deposit: Partial<Deposit>;
  DepositEdge: Partial<DepositEdge>;
  DepositsConnection: Partial<DepositsConnection>;
  ExtendCreditInput: Partial<ExtendCreditInput>;
  ExtendCreditMutationResponse: Partial<ExtendCreditMutationResponse>;
  FinalizePendingWithdrawalMutationResponse: Partial<FinalizePendingWithdrawalMutationResponse>;
  Http: Partial<Http>;
  HttpIncomingInput: Partial<HttpIncomingInput>;
  HttpInput: Partial<HttpInput>;
  HttpOutgoing: Partial<HttpOutgoing>;
  HttpOutgoingInput: Partial<HttpOutgoingInput>;
  IlpAccount: Partial<IlpAccount>;
  IlpAccountEdge: Partial<IlpAccountEdge>;
  IlpAccountsConnection: Partial<IlpAccountsConnection>;
  Mutation: {};
  MutationResponse: ResolversParentTypes['CreateDepositMutationResponse'] | ResolversParentTypes['CreateIlpAccountMutationResponse'] | ResolversParentTypes['CreateIlpSubAccountMutationResponse'] | ResolversParentTypes['CreateWebhookMutationResponse'] | ResolversParentTypes['CreateWithdrawalMutationResponse'] | ResolversParentTypes['DeleteIlpAccountMutationResponse'] | ResolversParentTypes['DeleteWebhookMutationResponse'] | ResolversParentTypes['ExtendCreditMutationResponse'] | ResolversParentTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversParentTypes['RevokeCreditMutationResponse'] | ResolversParentTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversParentTypes['SettleDebtMutationResponse'] | ResolversParentTypes['TransferMutationResponse'] | ResolversParentTypes['UpdateIlpAccountMutationResponse'] | ResolversParentTypes['UpdateWebhookMutationResponse'] | ResolversParentTypes['UtilizeCreditMutationResponse'];
  PageInfo: Partial<PageInfo>;
  Query: {};
  RevokeCreditInput: Partial<RevokeCreditInput>;
  RevokeCreditMutationResponse: Partial<RevokeCreditMutationResponse>;
  RollbackPendingWithdrawalMutationResponse: Partial<RollbackPendingWithdrawalMutationResponse>;
  Routing: Partial<Routing>;
  RoutingInput: Partial<RoutingInput>;
  SettleDebtInput: Partial<SettleDebtInput>;
  SettleDebtMutationResponse: Partial<SettleDebtMutationResponse>;
  Stream: Partial<Stream>;
  StreamInput: Partial<StreamInput>;
  SubAccountsConnection: Partial<SubAccountsConnection>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  UInt64: Partial<Scalars['UInt64']>;
  UpdateIlpAccountInput: Partial<UpdateIlpAccountInput>;
  UpdateIlpAccountMutationResponse: Partial<UpdateIlpAccountMutationResponse>;
  UpdateWebhookMutationResponse: Partial<UpdateWebhookMutationResponse>;
  UtilizeCreditInput: Partial<UtilizeCreditInput>;
  UtilizeCreditMutationResponse: Partial<UtilizeCreditMutationResponse>;
  Webhook: Partial<Webhook>;
  WebhookEdge: Partial<WebhookEdge>;
  WebhooksConnection: Partial<WebhooksConnection>;
  Withdrawal: Partial<Withdrawal>;
  WithdrawalEdge: Partial<WithdrawalEdge>;
  WithdrawalsConnection: Partial<WithdrawalsConnection>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BalanceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Balance'] = ResolversParentTypes['Balance']> = {
  balance?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  netLiability?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  netAssets?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  creditExtended?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  totalLent?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  availableCredit?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  totalBorrowed?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateDepositMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateDepositMutationResponse'] = ResolversParentTypes['CreateDepositMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deposit?: Resolver<Maybe<ResolversTypes['Deposit']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateIlpAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateIlpAccountMutationResponse'] = ResolversParentTypes['CreateIlpAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<Maybe<ResolversTypes['IlpAccount']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateIlpSubAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateIlpSubAccountMutationResponse'] = ResolversParentTypes['CreateIlpSubAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<Maybe<ResolversTypes['IlpAccount']>, ParentType, ContextType>;
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
  withdrawal?: Resolver<Maybe<ResolversTypes['Withdrawal']>, ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['WithdrawError']>, ParentType, ContextType>;
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
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  ilpAccountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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

export type ExtendCreditMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['ExtendCreditMutationResponse'] = ResolversParentTypes['ExtendCreditMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['CreditError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FinalizePendingWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['FinalizePendingWithdrawalMutationResponse'] = ResolversParentTypes['FinalizePendingWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['WithdrawError']>, ParentType, ContextType>;
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

export type IlpAccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['IlpAccount'] = ResolversParentTypes['IlpAccount']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  disabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  superAccountId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  superAccount?: Resolver<Maybe<ResolversTypes['IlpAccount']>, ParentType, ContextType>;
  subAccounts?: Resolver<ResolversTypes['SubAccountsConnection'], ParentType, ContextType, RequireFields<IlpAccountSubAccountsArgs, never>>;
  maxPacketAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  http?: Resolver<Maybe<ResolversTypes['Http']>, ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  stream?: Resolver<ResolversTypes['Stream'], ParentType, ContextType>;
  routing?: Resolver<Maybe<ResolversTypes['Routing']>, ParentType, ContextType>;
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
  createIlpAccount?: Resolver<ResolversTypes['CreateIlpAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateIlpAccountArgs, 'input'>>;
  updateIlpAccount?: Resolver<ResolversTypes['UpdateIlpAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateIlpAccountArgs, 'input'>>;
  deleteIlpAccount?: Resolver<ResolversTypes['DeleteIlpAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationDeleteIlpAccountArgs, 'id'>>;
  createIlpSubAccount?: Resolver<ResolversTypes['CreateIlpSubAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateIlpSubAccountArgs, 'superAccountId'>>;
  transfer?: Resolver<Maybe<ResolversTypes['TransferMutationResponse']>, ParentType, ContextType, RequireFields<MutationTransferArgs, 'sourceAmount' | 'sourceAccountId' | 'destinationAccountId' | 'idempotencyKey'>>;
  extendCredit?: Resolver<Maybe<ResolversTypes['ExtendCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationExtendCreditArgs, 'input'>>;
  revokeCredit?: Resolver<Maybe<ResolversTypes['RevokeCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeCreditArgs, 'input'>>;
  utilizeCredit?: Resolver<Maybe<ResolversTypes['UtilizeCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationUtilizeCreditArgs, 'input'>>;
  settleDebt?: Resolver<Maybe<ResolversTypes['SettleDebtMutationResponse']>, ParentType, ContextType, RequireFields<MutationSettleDebtArgs, never>>;
  createWebhook?: Resolver<Maybe<ResolversTypes['CreateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWebhookArgs, 'ilpAccountId'>>;
  updateWebhook?: Resolver<Maybe<ResolversTypes['UpdateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationUpdateWebhookArgs, 'webhookId'>>;
  deleteWebhook?: Resolver<Maybe<ResolversTypes['DeleteWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteWebhookArgs, 'webhookId'>>;
  createDeposit?: Resolver<Maybe<ResolversTypes['CreateDepositMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateDepositArgs, 'input'>>;
  createWithdrawal?: Resolver<Maybe<ResolversTypes['CreateWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWithdrawalArgs, 'input'>>;
  finalizePendingWithdrawal?: Resolver<Maybe<ResolversTypes['FinalizePendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationFinalizePendingWithdrawalArgs, 'withdrawalId'>>;
  rollbackPendingWithdrawal?: Resolver<Maybe<ResolversTypes['RollbackPendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationRollbackPendingWithdrawalArgs, 'withdrawalId'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'CreateDepositMutationResponse' | 'CreateIlpAccountMutationResponse' | 'CreateIlpSubAccountMutationResponse' | 'CreateWebhookMutationResponse' | 'CreateWithdrawalMutationResponse' | 'DeleteIlpAccountMutationResponse' | 'DeleteWebhookMutationResponse' | 'ExtendCreditMutationResponse' | 'FinalizePendingWithdrawalMutationResponse' | 'RevokeCreditMutationResponse' | 'RollbackPendingWithdrawalMutationResponse' | 'SettleDebtMutationResponse' | 'TransferMutationResponse' | 'UpdateIlpAccountMutationResponse' | 'UpdateWebhookMutationResponse' | 'UtilizeCreditMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type PageInfoResolvers<ContextType = any, ParentType extends ResolversParentTypes['PageInfo'] = ResolversParentTypes['PageInfo']> = {
  endCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  hasNextPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  hasPreviousPage?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  startCursor?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  ilpAccounts?: Resolver<ResolversTypes['IlpAccountsConnection'], ParentType, ContextType, RequireFields<QueryIlpAccountsArgs, never>>;
  ilpAccount?: Resolver<ResolversTypes['IlpAccount'], ParentType, ContextType, RequireFields<QueryIlpAccountArgs, 'id'>>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType, RequireFields<QueryWebhookArgs, 'id'>>;
  deposit?: Resolver<ResolversTypes['Deposit'], ParentType, ContextType, RequireFields<QueryDepositArgs, 'id'>>;
  withdrawal?: Resolver<ResolversTypes['Withdrawal'], ParentType, ContextType, RequireFields<QueryWithdrawalArgs, 'id'>>;
};

export type RevokeCreditMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeCreditMutationResponse'] = ResolversParentTypes['RevokeCreditMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['CreditError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RollbackPendingWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RollbackPendingWithdrawalMutationResponse'] = ResolversParentTypes['RollbackPendingWithdrawalMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['WithdrawError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RoutingResolvers<ContextType = any, ParentType extends ResolversParentTypes['Routing'] = ResolversParentTypes['Routing']> = {
  staticIlpAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  inheritFromRemote?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  dynamicIlpAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SettleDebtMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['SettleDebtMutationResponse'] = ResolversParentTypes['SettleDebtMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['CreditError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type StreamResolvers<ContextType = any, ParentType extends ResolversParentTypes['Stream'] = ResolversParentTypes['Stream']> = {
  enabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SubAccountsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['SubAccountsConnection'] = ResolversParentTypes['SubAccountsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['IlpAccountEdge']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TransferMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TransferMutationResponse'] = ResolversParentTypes['TransferMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type UpdateIlpAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateIlpAccountMutationResponse'] = ResolversParentTypes['UpdateIlpAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  ilpAccount?: Resolver<Maybe<ResolversTypes['IlpAccount']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UpdateWebhookMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateWebhookMutationResponse'] = ResolversParentTypes['UpdateWebhookMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UtilizeCreditMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UtilizeCreditMutationResponse'] = ResolversParentTypes['UtilizeCreditMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['CreditError']>, ParentType, ContextType>;
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
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  ilpAccountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  ExtendCreditMutationResponse?: ExtendCreditMutationResponseResolvers<ContextType>;
  FinalizePendingWithdrawalMutationResponse?: FinalizePendingWithdrawalMutationResponseResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  IlpAccount?: IlpAccountResolvers<ContextType>;
  IlpAccountEdge?: IlpAccountEdgeResolvers<ContextType>;
  IlpAccountsConnection?: IlpAccountsConnectionResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RevokeCreditMutationResponse?: RevokeCreditMutationResponseResolvers<ContextType>;
  RollbackPendingWithdrawalMutationResponse?: RollbackPendingWithdrawalMutationResponseResolvers<ContextType>;
  Routing?: RoutingResolvers<ContextType>;
  SettleDebtMutationResponse?: SettleDebtMutationResponseResolvers<ContextType>;
  Stream?: StreamResolvers<ContextType>;
  SubAccountsConnection?: SubAccountsConnectionResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  UInt64?: GraphQLScalarType;
  UpdateIlpAccountMutationResponse?: UpdateIlpAccountMutationResponseResolvers<ContextType>;
  UpdateWebhookMutationResponse?: UpdateWebhookMutationResponseResolvers<ContextType>;
  UtilizeCreditMutationResponse?: UtilizeCreditMutationResponseResolvers<ContextType>;
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
