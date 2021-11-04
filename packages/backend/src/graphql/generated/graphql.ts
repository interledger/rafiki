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

export type Account = {
  __typename?: 'Account';
  id: Scalars['ID'];
  disabled: Scalars['Boolean'];
  superAccountId?: Maybe<Scalars['ID']>;
  superAccount?: Maybe<Account>;
  subAccounts: SubAccountsConnection;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<Http>;
  asset: Asset;
  stream: Stream;
  routing?: Maybe<Routing>;
  balance: Balance;
  deposits: DepositsConnection;
  invoices?: Maybe<InvoiceConnection>;
  webhooks: WebhooksConnection;
};


export type AccountSubAccountsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type AccountDepositsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type AccountInvoicesArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type AccountWebhooksArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};

export type AccountEdge = {
  __typename?: 'AccountEdge';
  node: Account;
  cursor: Scalars['String'];
};

export type AccountsConnection = {
  __typename?: 'AccountsConnection';
  pageInfo: PageInfo;
  edges: Array<AccountEdge>;
};

export type ApiKey = {
  __typename?: 'ApiKey';
  id: Scalars['ID'];
  accountId: Scalars['String'];
  key: Scalars['String'];
  createdAt: Scalars['String'];
  updatedAt: Scalars['String'];
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

export type CreateAccountInput = {
  id?: Maybe<Scalars['String']>;
  disabled?: Maybe<Scalars['Boolean']>;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<HttpInput>;
  asset: AssetInput;
  stream?: Maybe<StreamInput>;
  routing?: Maybe<RoutingInput>;
};

export type CreateAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  account?: Maybe<Account>;
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

export type CreateDepositInput = {
  /** The id of the account to create the deposit for. */
  accountId: Scalars['String'];
  /** Amount of deposit. */
  amount: Scalars['UInt64'];
  /** The id of the deposit. */
  id?: Maybe<Scalars['String']>;
};

export type CreateDepositMutationResponse = MutationResponse & {
  __typename?: 'CreateDepositMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  deposit?: Maybe<Deposit>;
};

export type CreateOutgoingPaymentInput = {
  accountId: Scalars['String'];
  paymentPointer?: Maybe<Scalars['String']>;
  amountToSend?: Maybe<Scalars['UInt64']>;
  invoiceUrl?: Maybe<Scalars['String']>;
  autoApprove: Scalars['Boolean'];
};

export type CreateSubAccountMutationResponse = MutationResponse & {
  __typename?: 'CreateSubAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  account?: Maybe<Account>;
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
  accountId: Scalars['String'];
  /** Amount of withdrawal. */
  amount: Scalars['UInt64'];
  /** The id of the withdrawal. */
  id?: Maybe<Scalars['String']>;
};

export type CreateWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'CreateWithdrawalMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  withdrawal?: Maybe<Withdrawal>;
  error?: Maybe<WithdrawalError>;
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

export type DeleteAccountMutationResponse = MutationResponse & {
  __typename?: 'DeleteAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
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
  accountId: Scalars['ID'];
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
  accountId: Scalars['String'];
  /** Sub-account to which credit is extended. */
  subAccountId: Scalars['String'];
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
  error?: Maybe<WithdrawalError>;
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

export type Invoice = {
  __typename?: 'Invoice';
  id: Scalars['ID'];
  receivedAmount: Scalars['UInt64'];
  maximumAmount?: Maybe<Scalars['UInt64']>;
  asset: Asset;
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
  /** Create account */
  createAccount: CreateAccountMutationResponse;
  /** Update account */
  updateAccount: UpdateAccountMutationResponse;
  /** Delete account */
  deleteAccount: DeleteAccountMutationResponse;
  /** Create sub-account */
  createSubAccount: CreateSubAccountMutationResponse;
  createOutgoingPayment: OutgoingPaymentResponse;
  /** Approve a Ready payment's quote. */
  approveOutgoingPayment: OutgoingPaymentResponse;
  /** Requote a Cancelled payment. */
  requoteOutgoingPayment: OutgoingPaymentResponse;
  /** Cancel a Ready payment. */
  cancelOutgoingPayment: OutgoingPaymentResponse;
  /** Transfer between accounts */
  transfer?: Maybe<TransferMutationResponse>;
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
  /** Extend Credit */
  extendCredit?: Maybe<ExtendCreditMutationResponse>;
  /** Revoke Credit */
  revokeCredit?: Maybe<RevokeCreditMutationResponse>;
  /** Utilize Credit */
  utilizeCredit?: Maybe<UtilizeCreditMutationResponse>;
  /** Settle Debt */
  settleDebt?: Maybe<SettleDebtMutationResponse>;
  /** Create API Key */
  createApiKey?: Maybe<CreateApiKeyMutationResponse>;
  /** Delete all API Keys */
  deleteAllApiKeys?: Maybe<DeleteAllApiKeysMutationResponse>;
  /** Redeem Session Key */
  redeemSessionKey?: Maybe<RedeemSessionKeyMutationResponse>;
};


export type MutationCreateAccountArgs = {
  input: CreateAccountInput;
};


export type MutationUpdateAccountArgs = {
  input: UpdateAccountInput;
};


export type MutationDeleteAccountArgs = {
  id: Scalars['String'];
};


export type MutationCreateSubAccountArgs = {
  superAccountId: Scalars['String'];
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


export type MutationTransferArgs = {
  sourceAmount: Scalars['UInt64'];
  sourceAccountId: Scalars['ID'];
  destinationAccountId: Scalars['ID'];
  destinationAmount?: Maybe<Scalars['UInt64']>;
  autoCommit?: Maybe<Scalars['Boolean']>;
  idempotencyKey: Scalars['ID'];
};


export type MutationCreateWebhookArgs = {
  ilpAccountId: Scalars['String'];
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
  withdrawalId: Scalars['String'];
};


export type MutationRollbackPendingWithdrawalArgs = {
  withdrawalId: Scalars['String'];
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


export type MutationCreateApiKeyArgs = {
  input: CreateApiKeyInput;
};


export type MutationDeleteAllApiKeysArgs = {
  input: DeleteAllApiKeysInput;
};


export type MutationRedeemSessionKeyArgs = {
  input: RedeemSessionKeyInput;
};

export type MutationResponse = {
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};

export type OutgoingPayment = {
  __typename?: 'OutgoingPayment';
  id: Scalars['ID'];
  state: PaymentState;
  error?: Maybe<Scalars['String']>;
  stateAttempts: Scalars['Int'];
  intent?: Maybe<PaymentIntent>;
  quote?: Maybe<PaymentQuote>;
  superAccountId: Scalars['String'];
  sourceAccount: PaymentSourceAccount;
  destinationAccount: PaymentDestinationAccount;
  outcome: OutgoingPaymentOutcome;
};

export type OutgoingPaymentOutcome = {
  __typename?: 'OutgoingPaymentOutcome';
  amountSent: Scalars['String'];
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
};

export type PaymentIntent = {
  __typename?: 'PaymentIntent';
  paymentPointer?: Maybe<Scalars['String']>;
  amountToSend?: Maybe<Scalars['UInt64']>;
  invoiceUrl?: Maybe<Scalars['String']>;
  autoApprove: Scalars['Boolean'];
};

export type PaymentQuote = {
  __typename?: 'PaymentQuote';
  timestamp: Scalars['String'];
  activationDeadline: Scalars['String'];
  targetType: PaymentType;
  minDeliveryAmount: Scalars['UInt64'];
  maxSourceAmount: Scalars['UInt64'];
  maxPacketAmount: Scalars['UInt64'];
  minExchangeRate: Scalars['Float'];
  lowExchangeRateEstimate: Scalars['Float'];
  highExchangeRateEstimate: Scalars['Float'];
};

export type PaymentSourceAccount = {
  __typename?: 'PaymentSourceAccount';
  id: Scalars['String'];
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
  /** Fetch a page of accounts. */
  accounts: AccountsConnection;
  outgoingPayment?: Maybe<OutgoingPayment>;
  /** Get a webhook by ID. */
  webhook: Webhook;
  /** Get a deposit by ID. */
  deposit: Deposit;
  /** Get a withdrawal by ID. */
  withdrawal: Withdrawal;
};


export type QueryAccountArgs = {
  id: Scalars['String'];
};


export type QueryAccountsArgs = {
  after?: Maybe<Scalars['String']>;
  before?: Maybe<Scalars['String']>;
  first?: Maybe<Scalars['Int']>;
  last?: Maybe<Scalars['Int']>;
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String'];
};


export type QueryWebhookArgs = {
  id: Scalars['String'];
};


export type QueryDepositArgs = {
  id: Scalars['String'];
};


export type QueryWithdrawalArgs = {
  id: Scalars['String'];
};

export type RedeemSessionKeyInput = {
  /** API key */
  key: Scalars['String'];
  /** Account API key was issued for. */
  accountId: Scalars['String'];
};

export type RedeemSessionKeyMutationResponse = MutationResponse & {
  __typename?: 'RedeemSessionKeyMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  session?: Maybe<Session>;
};

export type RevokeCreditInput = {
  /** Account revoking credit. */
  accountId: Scalars['String'];
  /** Sub-account to which credit is revoked. */
  subAccountId: Scalars['String'];
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
  error?: Maybe<WithdrawalError>;
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

export type Session = {
  __typename?: 'Session';
  key: Scalars['String'];
  expiresAt: Scalars['String'];
};

export type SettleDebtInput = {
  /** Account collecting debt. */
  accountId: Scalars['String'];
  /** Sub-account settling debt. */
  subAccountId: Scalars['String'];
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
  edges: Array<AccountEdge>;
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
};


export type UpdateAccountInput = {
  id?: Maybe<Scalars['String']>;
  disabled?: Maybe<Scalars['Boolean']>;
  maxPacketAmount?: Maybe<Scalars['UInt64']>;
  http?: Maybe<HttpInput>;
  stream?: Maybe<StreamInput>;
  routing?: Maybe<RoutingInput>;
};

export type UpdateAccountMutationResponse = MutationResponse & {
  __typename?: 'UpdateAccountMutationResponse';
  code: Scalars['String'];
  success: Scalars['Boolean'];
  message: Scalars['String'];
  account?: Maybe<Account>;
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
  accountId: Scalars['String'];
  /** Sub-account to which credit is extended. */
  subAccountId: Scalars['String'];
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

export type Withdrawal = {
  __typename?: 'Withdrawal';
  id: Scalars['ID'];
  amount: Scalars['UInt64'];
  accountId: Scalars['ID'];
};

export type WithdrawalEdge = {
  __typename?: 'WithdrawalEdge';
  node: Withdrawal;
  cursor: Scalars['String'];
};

export enum WithdrawalError {
  AlreadyFinalized = 'AlreadyFinalized',
  AlreadyRolledBack = 'AlreadyRolledBack',
  InsufficientBalance = 'InsufficientBalance',
  InsufficientLiquidity = 'InsufficientLiquidity',
  InvalidId = 'InvalidId',
  UnknownAccount = 'UnknownAccount',
  UnknownAsset = 'UnknownAsset',
  UnknownWithdrawal = 'UnknownWithdrawal',
  WithdrawalExists = 'WithdrawalExists'
}

export type WithdrawalsConnection = {
  __typename?: 'WithdrawalsConnection';
  pageInfo: PageInfo;
  edges: Array<WithdrawalEdge>;
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
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']>>;
  AccountEdge: ResolverTypeWrapper<Partial<AccountEdge>>;
  AccountsConnection: ResolverTypeWrapper<Partial<AccountsConnection>>;
  ApiKey: ResolverTypeWrapper<Partial<ApiKey>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  AssetInput: ResolverTypeWrapper<Partial<AssetInput>>;
  Balance: ResolverTypeWrapper<Partial<Balance>>;
  CreateAccountInput: ResolverTypeWrapper<Partial<CreateAccountInput>>;
  CreateAccountMutationResponse: ResolverTypeWrapper<Partial<CreateAccountMutationResponse>>;
  CreateApiKeyInput: ResolverTypeWrapper<Partial<CreateApiKeyInput>>;
  CreateApiKeyMutationResponse: ResolverTypeWrapper<Partial<CreateApiKeyMutationResponse>>;
  CreateDepositInput: ResolverTypeWrapper<Partial<CreateDepositInput>>;
  CreateDepositMutationResponse: ResolverTypeWrapper<Partial<CreateDepositMutationResponse>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  CreateSubAccountMutationResponse: ResolverTypeWrapper<Partial<CreateSubAccountMutationResponse>>;
  CreateWebhookMutationResponse: ResolverTypeWrapper<Partial<CreateWebhookMutationResponse>>;
  CreateWithdrawalInput: ResolverTypeWrapper<Partial<CreateWithdrawalInput>>;
  CreateWithdrawalMutationResponse: ResolverTypeWrapper<Partial<CreateWithdrawalMutationResponse>>;
  CreditError: ResolverTypeWrapper<Partial<CreditError>>;
  DeleteAccountMutationResponse: ResolverTypeWrapper<Partial<DeleteAccountMutationResponse>>;
  DeleteAllApiKeysInput: ResolverTypeWrapper<Partial<DeleteAllApiKeysInput>>;
  DeleteAllApiKeysMutationResponse: ResolverTypeWrapper<Partial<DeleteAllApiKeysMutationResponse>>;
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
  Invoice: ResolverTypeWrapper<Partial<Invoice>>;
  InvoiceConnection: ResolverTypeWrapper<Partial<InvoiceConnection>>;
  InvoiceEdge: ResolverTypeWrapper<Partial<InvoiceEdge>>;
  Mutation: ResolverTypeWrapper<{}>;
  MutationResponse: ResolversTypes['CreateAccountMutationResponse'] | ResolversTypes['CreateApiKeyMutationResponse'] | ResolversTypes['CreateDepositMutationResponse'] | ResolversTypes['CreateSubAccountMutationResponse'] | ResolversTypes['CreateWebhookMutationResponse'] | ResolversTypes['CreateWithdrawalMutationResponse'] | ResolversTypes['DeleteAccountMutationResponse'] | ResolversTypes['DeleteAllApiKeysMutationResponse'] | ResolversTypes['DeleteWebhookMutationResponse'] | ResolversTypes['ExtendCreditMutationResponse'] | ResolversTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversTypes['RedeemSessionKeyMutationResponse'] | ResolversTypes['RevokeCreditMutationResponse'] | ResolversTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversTypes['SettleDebtMutationResponse'] | ResolversTypes['TransferMutationResponse'] | ResolversTypes['UpdateAccountMutationResponse'] | ResolversTypes['UpdateWebhookMutationResponse'] | ResolversTypes['UtilizeCreditMutationResponse'];
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentOutcome: ResolverTypeWrapper<Partial<OutgoingPaymentOutcome>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  PaymentDestinationAccount: ResolverTypeWrapper<Partial<PaymentDestinationAccount>>;
  PaymentIntent: ResolverTypeWrapper<Partial<PaymentIntent>>;
  PaymentQuote: ResolverTypeWrapper<Partial<PaymentQuote>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']>>;
  PaymentSourceAccount: ResolverTypeWrapper<Partial<PaymentSourceAccount>>;
  PaymentState: ResolverTypeWrapper<Partial<PaymentState>>;
  PaymentType: ResolverTypeWrapper<Partial<PaymentType>>;
  Query: ResolverTypeWrapper<{}>;
  RedeemSessionKeyInput: ResolverTypeWrapper<Partial<RedeemSessionKeyInput>>;
  RedeemSessionKeyMutationResponse: ResolverTypeWrapper<Partial<RedeemSessionKeyMutationResponse>>;
  RevokeCreditInput: ResolverTypeWrapper<Partial<RevokeCreditInput>>;
  RevokeCreditMutationResponse: ResolverTypeWrapper<Partial<RevokeCreditMutationResponse>>;
  RollbackPendingWithdrawalMutationResponse: ResolverTypeWrapper<Partial<RollbackPendingWithdrawalMutationResponse>>;
  Routing: ResolverTypeWrapper<Partial<Routing>>;
  RoutingInput: ResolverTypeWrapper<Partial<RoutingInput>>;
  Session: ResolverTypeWrapper<Partial<Session>>;
  SettleDebtInput: ResolverTypeWrapper<Partial<SettleDebtInput>>;
  SettleDebtMutationResponse: ResolverTypeWrapper<Partial<SettleDebtMutationResponse>>;
  Stream: ResolverTypeWrapper<Partial<Stream>>;
  StreamInput: ResolverTypeWrapper<Partial<StreamInput>>;
  SubAccountsConnection: ResolverTypeWrapper<Partial<SubAccountsConnection>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']>>;
  UpdateAccountInput: ResolverTypeWrapper<Partial<UpdateAccountInput>>;
  UpdateAccountMutationResponse: ResolverTypeWrapper<Partial<UpdateAccountMutationResponse>>;
  UpdateWebhookMutationResponse: ResolverTypeWrapper<Partial<UpdateWebhookMutationResponse>>;
  UtilizeCreditInput: ResolverTypeWrapper<Partial<UtilizeCreditInput>>;
  UtilizeCreditMutationResponse: ResolverTypeWrapper<Partial<UtilizeCreditMutationResponse>>;
  Webhook: ResolverTypeWrapper<Partial<Webhook>>;
  WebhookEdge: ResolverTypeWrapper<Partial<WebhookEdge>>;
  WebhooksConnection: ResolverTypeWrapper<Partial<WebhooksConnection>>;
  Withdrawal: ResolverTypeWrapper<Partial<Withdrawal>>;
  WithdrawalEdge: ResolverTypeWrapper<Partial<WithdrawalEdge>>;
  WithdrawalError: ResolverTypeWrapper<Partial<WithdrawalError>>;
  WithdrawalsConnection: ResolverTypeWrapper<Partial<WithdrawalsConnection>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  Account: Partial<Account>;
  ID: Partial<Scalars['ID']>;
  Boolean: Partial<Scalars['Boolean']>;
  String: Partial<Scalars['String']>;
  Int: Partial<Scalars['Int']>;
  AccountEdge: Partial<AccountEdge>;
  AccountsConnection: Partial<AccountsConnection>;
  ApiKey: Partial<ApiKey>;
  Asset: Partial<Asset>;
  AssetInput: Partial<AssetInput>;
  Balance: Partial<Balance>;
  CreateAccountInput: Partial<CreateAccountInput>;
  CreateAccountMutationResponse: Partial<CreateAccountMutationResponse>;
  CreateApiKeyInput: Partial<CreateApiKeyInput>;
  CreateApiKeyMutationResponse: Partial<CreateApiKeyMutationResponse>;
  CreateDepositInput: Partial<CreateDepositInput>;
  CreateDepositMutationResponse: Partial<CreateDepositMutationResponse>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  CreateSubAccountMutationResponse: Partial<CreateSubAccountMutationResponse>;
  CreateWebhookMutationResponse: Partial<CreateWebhookMutationResponse>;
  CreateWithdrawalInput: Partial<CreateWithdrawalInput>;
  CreateWithdrawalMutationResponse: Partial<CreateWithdrawalMutationResponse>;
  DeleteAccountMutationResponse: Partial<DeleteAccountMutationResponse>;
  DeleteAllApiKeysInput: Partial<DeleteAllApiKeysInput>;
  DeleteAllApiKeysMutationResponse: Partial<DeleteAllApiKeysMutationResponse>;
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
  Invoice: Partial<Invoice>;
  InvoiceConnection: Partial<InvoiceConnection>;
  InvoiceEdge: Partial<InvoiceEdge>;
  Mutation: {};
  MutationResponse: ResolversParentTypes['CreateAccountMutationResponse'] | ResolversParentTypes['CreateApiKeyMutationResponse'] | ResolversParentTypes['CreateDepositMutationResponse'] | ResolversParentTypes['CreateSubAccountMutationResponse'] | ResolversParentTypes['CreateWebhookMutationResponse'] | ResolversParentTypes['CreateWithdrawalMutationResponse'] | ResolversParentTypes['DeleteAccountMutationResponse'] | ResolversParentTypes['DeleteAllApiKeysMutationResponse'] | ResolversParentTypes['DeleteWebhookMutationResponse'] | ResolversParentTypes['ExtendCreditMutationResponse'] | ResolversParentTypes['FinalizePendingWithdrawalMutationResponse'] | ResolversParentTypes['RedeemSessionKeyMutationResponse'] | ResolversParentTypes['RevokeCreditMutationResponse'] | ResolversParentTypes['RollbackPendingWithdrawalMutationResponse'] | ResolversParentTypes['SettleDebtMutationResponse'] | ResolversParentTypes['TransferMutationResponse'] | ResolversParentTypes['UpdateAccountMutationResponse'] | ResolversParentTypes['UpdateWebhookMutationResponse'] | ResolversParentTypes['UtilizeCreditMutationResponse'];
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentOutcome: Partial<OutgoingPaymentOutcome>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  PaymentDestinationAccount: Partial<PaymentDestinationAccount>;
  PaymentIntent: Partial<PaymentIntent>;
  PaymentQuote: Partial<PaymentQuote>;
  Float: Partial<Scalars['Float']>;
  PaymentSourceAccount: Partial<PaymentSourceAccount>;
  Query: {};
  RedeemSessionKeyInput: Partial<RedeemSessionKeyInput>;
  RedeemSessionKeyMutationResponse: Partial<RedeemSessionKeyMutationResponse>;
  RevokeCreditInput: Partial<RevokeCreditInput>;
  RevokeCreditMutationResponse: Partial<RevokeCreditMutationResponse>;
  RollbackPendingWithdrawalMutationResponse: Partial<RollbackPendingWithdrawalMutationResponse>;
  Routing: Partial<Routing>;
  RoutingInput: Partial<RoutingInput>;
  Session: Partial<Session>;
  SettleDebtInput: Partial<SettleDebtInput>;
  SettleDebtMutationResponse: Partial<SettleDebtMutationResponse>;
  Stream: Partial<Stream>;
  StreamInput: Partial<StreamInput>;
  SubAccountsConnection: Partial<SubAccountsConnection>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  UInt64: Partial<Scalars['UInt64']>;
  UpdateAccountInput: Partial<UpdateAccountInput>;
  UpdateAccountMutationResponse: Partial<UpdateAccountMutationResponse>;
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

export type AccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Account'] = ResolversParentTypes['Account']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  disabled?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  superAccountId?: Resolver<Maybe<ResolversTypes['ID']>, ParentType, ContextType>;
  superAccount?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType>;
  subAccounts?: Resolver<ResolversTypes['SubAccountsConnection'], ParentType, ContextType, RequireFields<AccountSubAccountsArgs, never>>;
  maxPacketAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  http?: Resolver<Maybe<ResolversTypes['Http']>, ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  stream?: Resolver<ResolversTypes['Stream'], ParentType, ContextType>;
  routing?: Resolver<Maybe<ResolversTypes['Routing']>, ParentType, ContextType>;
  balance?: Resolver<ResolversTypes['Balance'], ParentType, ContextType>;
  deposits?: Resolver<ResolversTypes['DepositsConnection'], ParentType, ContextType, RequireFields<AccountDepositsArgs, never>>;
  invoices?: Resolver<Maybe<ResolversTypes['InvoiceConnection']>, ParentType, ContextType, RequireFields<AccountInvoicesArgs, never>>;
  webhooks?: Resolver<ResolversTypes['WebhooksConnection'], ParentType, ContextType, RequireFields<AccountWebhooksArgs, never>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AccountEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountEdge'] = ResolversParentTypes['AccountEdge']> = {
  node?: Resolver<ResolversTypes['Account'], ParentType, ContextType>;
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AccountsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountsConnection'] = ResolversParentTypes['AccountsConnection']> = {
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  edges?: Resolver<Array<ResolversTypes['AccountEdge']>, ParentType, ContextType>;
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

export type CreateDepositMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateDepositMutationResponse'] = ResolversParentTypes['CreateDepositMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  deposit?: Resolver<Maybe<ResolversTypes['Deposit']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateSubAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateSubAccountMutationResponse'] = ResolversParentTypes['CreateSubAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType>;
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
  error?: Resolver<Maybe<ResolversTypes['WithdrawalError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteAccountMutationResponse'] = ResolversParentTypes['DeleteAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteAllApiKeysMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteAllApiKeysMutationResponse'] = ResolversParentTypes['DeleteAllApiKeysMutationResponse']> = {
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
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  error?: Resolver<Maybe<ResolversTypes['WithdrawalError']>, ParentType, ContextType>;
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

export type InvoiceResolvers<ContextType = any, ParentType extends ResolversParentTypes['Invoice'] = ResolversParentTypes['Invoice']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  maximumAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
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
  createAccount?: Resolver<ResolversTypes['CreateAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAccountArgs, 'input'>>;
  updateAccount?: Resolver<ResolversTypes['UpdateAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateAccountArgs, 'input'>>;
  deleteAccount?: Resolver<ResolversTypes['DeleteAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationDeleteAccountArgs, 'id'>>;
  createSubAccount?: Resolver<ResolversTypes['CreateSubAccountMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateSubAccountArgs, 'superAccountId'>>;
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  approveOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationApproveOutgoingPaymentArgs, 'paymentId'>>;
  requoteOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationRequoteOutgoingPaymentArgs, 'paymentId'>>;
  cancelOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCancelOutgoingPaymentArgs, 'paymentId'>>;
  transfer?: Resolver<Maybe<ResolversTypes['TransferMutationResponse']>, ParentType, ContextType, RequireFields<MutationTransferArgs, 'sourceAmount' | 'sourceAccountId' | 'destinationAccountId' | 'idempotencyKey'>>;
  createWebhook?: Resolver<Maybe<ResolversTypes['CreateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWebhookArgs, 'ilpAccountId'>>;
  updateWebhook?: Resolver<Maybe<ResolversTypes['UpdateWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationUpdateWebhookArgs, 'webhookId'>>;
  deleteWebhook?: Resolver<Maybe<ResolversTypes['DeleteWebhookMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteWebhookArgs, 'webhookId'>>;
  createDeposit?: Resolver<Maybe<ResolversTypes['CreateDepositMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateDepositArgs, 'input'>>;
  createWithdrawal?: Resolver<Maybe<ResolversTypes['CreateWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWithdrawalArgs, 'input'>>;
  finalizePendingWithdrawal?: Resolver<Maybe<ResolversTypes['FinalizePendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationFinalizePendingWithdrawalArgs, 'withdrawalId'>>;
  rollbackPendingWithdrawal?: Resolver<Maybe<ResolversTypes['RollbackPendingWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationRollbackPendingWithdrawalArgs, 'withdrawalId'>>;
  extendCredit?: Resolver<Maybe<ResolversTypes['ExtendCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationExtendCreditArgs, 'input'>>;
  revokeCredit?: Resolver<Maybe<ResolversTypes['RevokeCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeCreditArgs, 'input'>>;
  utilizeCredit?: Resolver<Maybe<ResolversTypes['UtilizeCreditMutationResponse']>, ParentType, ContextType, RequireFields<MutationUtilizeCreditArgs, 'input'>>;
  settleDebt?: Resolver<Maybe<ResolversTypes['SettleDebtMutationResponse']>, ParentType, ContextType, RequireFields<MutationSettleDebtArgs, never>>;
  createApiKey?: Resolver<Maybe<ResolversTypes['CreateApiKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateApiKeyArgs, 'input'>>;
  deleteAllApiKeys?: Resolver<Maybe<ResolversTypes['DeleteAllApiKeysMutationResponse']>, ParentType, ContextType, RequireFields<MutationDeleteAllApiKeysArgs, 'input'>>;
  redeemSessionKey?: Resolver<Maybe<ResolversTypes['RedeemSessionKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRedeemSessionKeyArgs, 'input'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'CreateAccountMutationResponse' | 'CreateApiKeyMutationResponse' | 'CreateDepositMutationResponse' | 'CreateSubAccountMutationResponse' | 'CreateWebhookMutationResponse' | 'CreateWithdrawalMutationResponse' | 'DeleteAccountMutationResponse' | 'DeleteAllApiKeysMutationResponse' | 'DeleteWebhookMutationResponse' | 'ExtendCreditMutationResponse' | 'FinalizePendingWithdrawalMutationResponse' | 'RedeemSessionKeyMutationResponse' | 'RevokeCreditMutationResponse' | 'RollbackPendingWithdrawalMutationResponse' | 'SettleDebtMutationResponse' | 'TransferMutationResponse' | 'UpdateAccountMutationResponse' | 'UpdateWebhookMutationResponse' | 'UtilizeCreditMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['PaymentState'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  stateAttempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  intent?: Resolver<Maybe<ResolversTypes['PaymentIntent']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['PaymentQuote']>, ParentType, ContextType>;
  superAccountId?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sourceAccount?: Resolver<ResolversTypes['PaymentSourceAccount'], ParentType, ContextType>;
  destinationAccount?: Resolver<ResolversTypes['PaymentDestinationAccount'], ParentType, ContextType>;
  outcome?: Resolver<ResolversTypes['OutgoingPaymentOutcome'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type OutgoingPaymentOutcomeResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPaymentOutcome'] = ResolversParentTypes['OutgoingPaymentOutcome']> = {
  amountSent?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentIntentResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentIntent'] = ResolversParentTypes['PaymentIntent']> = {
  paymentPointer?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  amountToSend?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  invoiceUrl?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  autoApprove?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentQuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentQuote'] = ResolversParentTypes['PaymentQuote']> = {
  timestamp?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  activationDeadline?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  targetType?: Resolver<ResolversTypes['PaymentType'], ParentType, ContextType>;
  minDeliveryAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  maxSourceAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  minExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  lowExchangeRateEstimate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  highExchangeRateEstimate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentSourceAccountResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentSourceAccount'] = ResolversParentTypes['PaymentSourceAccount']> = {
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type QueryResolvers<ContextType = any, ParentType extends ResolversParentTypes['Query'] = ResolversParentTypes['Query']> = {
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType, RequireFields<QueryAccountArgs, 'id'>>;
  accounts?: Resolver<ResolversTypes['AccountsConnection'], ParentType, ContextType, RequireFields<QueryAccountsArgs, never>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
  webhook?: Resolver<ResolversTypes['Webhook'], ParentType, ContextType, RequireFields<QueryWebhookArgs, 'id'>>;
  deposit?: Resolver<ResolversTypes['Deposit'], ParentType, ContextType, RequireFields<QueryDepositArgs, 'id'>>;
  withdrawal?: Resolver<ResolversTypes['Withdrawal'], ParentType, ContextType, RequireFields<QueryWithdrawalArgs, 'id'>>;
};

export type RedeemSessionKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RedeemSessionKeyMutationResponse'] = ResolversParentTypes['RedeemSessionKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  session?: Resolver<Maybe<ResolversTypes['Session']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
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
  error?: Resolver<Maybe<ResolversTypes['WithdrawalError']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RoutingResolvers<ContextType = any, ParentType extends ResolversParentTypes['Routing'] = ResolversParentTypes['Routing']> = {
  staticIlpAddress?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  inheritFromRemote?: Resolver<Maybe<ResolversTypes['Boolean']>, ParentType, ContextType>;
  dynamicIlpAddress?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SessionResolvers<ContextType = any, ParentType extends ResolversParentTypes['Session'] = ResolversParentTypes['Session']> = {
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  edges?: Resolver<Array<ResolversTypes['AccountEdge']>, ParentType, ContextType>;
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

export type UpdateAccountMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateAccountMutationResponse'] = ResolversParentTypes['UpdateAccountMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  account?: Resolver<Maybe<ResolversTypes['Account']>, ParentType, ContextType>;
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
  accountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  Account?: AccountResolvers<ContextType>;
  AccountEdge?: AccountEdgeResolvers<ContextType>;
  AccountsConnection?: AccountsConnectionResolvers<ContextType>;
  ApiKey?: ApiKeyResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  Balance?: BalanceResolvers<ContextType>;
  CreateAccountMutationResponse?: CreateAccountMutationResponseResolvers<ContextType>;
  CreateApiKeyMutationResponse?: CreateApiKeyMutationResponseResolvers<ContextType>;
  CreateDepositMutationResponse?: CreateDepositMutationResponseResolvers<ContextType>;
  CreateSubAccountMutationResponse?: CreateSubAccountMutationResponseResolvers<ContextType>;
  CreateWebhookMutationResponse?: CreateWebhookMutationResponseResolvers<ContextType>;
  CreateWithdrawalMutationResponse?: CreateWithdrawalMutationResponseResolvers<ContextType>;
  DeleteAccountMutationResponse?: DeleteAccountMutationResponseResolvers<ContextType>;
  DeleteAllApiKeysMutationResponse?: DeleteAllApiKeysMutationResponseResolvers<ContextType>;
  DeleteWebhookMutationResponse?: DeleteWebhookMutationResponseResolvers<ContextType>;
  Deposit?: DepositResolvers<ContextType>;
  DepositEdge?: DepositEdgeResolvers<ContextType>;
  DepositsConnection?: DepositsConnectionResolvers<ContextType>;
  ExtendCreditMutationResponse?: ExtendCreditMutationResponseResolvers<ContextType>;
  FinalizePendingWithdrawalMutationResponse?: FinalizePendingWithdrawalMutationResponseResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  Invoice?: InvoiceResolvers<ContextType>;
  InvoiceConnection?: InvoiceConnectionResolvers<ContextType>;
  InvoiceEdge?: InvoiceEdgeResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  MutationResponse?: MutationResponseResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentOutcome?: OutgoingPaymentOutcomeResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  PaymentDestinationAccount?: PaymentDestinationAccountResolvers<ContextType>;
  PaymentIntent?: PaymentIntentResolvers<ContextType>;
  PaymentQuote?: PaymentQuoteResolvers<ContextType>;
  PaymentSourceAccount?: PaymentSourceAccountResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  RedeemSessionKeyMutationResponse?: RedeemSessionKeyMutationResponseResolvers<ContextType>;
  RevokeCreditMutationResponse?: RevokeCreditMutationResponseResolvers<ContextType>;
  RollbackPendingWithdrawalMutationResponse?: RollbackPendingWithdrawalMutationResponseResolvers<ContextType>;
  Routing?: RoutingResolvers<ContextType>;
  Session?: SessionResolvers<ContextType>;
  SettleDebtMutationResponse?: SettleDebtMutationResponseResolvers<ContextType>;
  Stream?: StreamResolvers<ContextType>;
  SubAccountsConnection?: SubAccountsConnectionResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  UInt64?: GraphQLScalarType;
  UpdateAccountMutationResponse?: UpdateAccountMutationResponseResolvers<ContextType>;
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
