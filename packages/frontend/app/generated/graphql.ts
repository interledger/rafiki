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
  JSONObject: { input: any; output: any; }
  UInt8: { input: number; output: number; }
  UInt64: { input: bigint; output: bigint; }
};

export type AccountingTransfer = Model & {
  __typename?: 'AccountingTransfer';
  /** Amount sent (fixed send) */
  amount: Scalars['UInt64']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Credit account id */
  creditAccountId: Scalars['ID']['output'];
  /** Debit account id */
  debitAccountId: Scalars['ID']['output'];
  /** Payment id */
  id: Scalars['ID']['output'];
  /** Identifier that partitions the sets of accounts that can transact with each other. */
  ledger: Scalars['UInt8']['output'];
  /** Type of accounting transfer */
  transferType: TransferType;
};

export type AccountingTransferConnection = {
  __typename?: 'AccountingTransferConnection';
  credits: Array<AccountingTransfer>;
  debits: Array<AccountingTransfer>;
};

export type AdditionalProperty = {
  __typename?: 'AdditionalProperty';
  key: Scalars['String']['output'];
  value: Scalars['String']['output'];
  visibleInOpenPayments: Scalars['Boolean']['output'];
};

export type AdditionalPropertyInput = {
  key: Scalars['String']['input'];
  value: Scalars['String']['input'];
  visibleInOpenPayments: Scalars['Boolean']['input'];
};

export enum Alg {
  EdDsa = 'EdDSA'
}

export type Amount = {
  __typename?: 'Amount';
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  assetCode: Scalars['String']['output'];
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  assetScale: Scalars['UInt8']['output'];
  value: Scalars['UInt64']['output'];
};

export type AmountInput = {
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  assetCode: Scalars['String']['input'];
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  assetScale: Scalars['UInt8']['input'];
  value: Scalars['UInt64']['input'];
};

export type ApproveIncomingPaymentInput = {
  /** Unique identifier of the incoming payment to be approved. Note: Incoming Payment must be PENDING. */
  id: Scalars['ID']['input'];
};

export type ApproveIncomingPaymentResponse = {
  __typename?: 'ApproveIncomingPaymentResponse';
  payment?: Maybe<IncomingPayment>;
};

export type Asset = Model & {
  __typename?: 'Asset';
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  code: Scalars['String']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Fetch a page of asset fees */
  fees?: Maybe<FeesConnection>;
  /** Asset id */
  id: Scalars['ID']['output'];
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** Account Servicing Entity will be notified via a webhook event if liquidity falls below this value */
  liquidityThreshold?: Maybe<Scalars['UInt64']['output']>;
  /** The receiving fee structure for the asset */
  receivingFee?: Maybe<Fee>;
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  scale: Scalars['UInt8']['output'];
  /** The sending fee structure for the asset */
  sendingFee?: Maybe<Fee>;
  /** Minimum amount of liquidity that can be withdrawn from the asset */
  withdrawalThreshold?: Maybe<Scalars['UInt64']['output']>;
};


export type AssetFeesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};

export type AssetEdge = {
  __typename?: 'AssetEdge';
  cursor: Scalars['String']['output'];
  node: Asset;
};

export type AssetMutationResponse = {
  __typename?: 'AssetMutationResponse';
  asset?: Maybe<Asset>;
};

export type AssetsConnection = {
  __typename?: 'AssetsConnection';
  edges: Array<AssetEdge>;
  pageInfo: PageInfo;
};

export type BasePayment = {
  client?: Maybe<Scalars['String']['output']>;
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  walletAddressId: Scalars['ID']['output'];
};

export type CancelIncomingPaymentInput = {
  /** Unique identifier of the incoming payment to be cancelled. Note: Incoming Payment must be PENDING. */
  id: Scalars['ID']['input'];
};

export type CancelIncomingPaymentResponse = {
  __typename?: 'CancelIncomingPaymentResponse';
  payment?: Maybe<IncomingPayment>;
};

export type CancelOutgoingPaymentInput = {
  /** Outgoing payment id */
  id: Scalars['ID']['input'];
  /** Reason why this Outgoing Payment has been cancelled. This value will be publicly visible in the metadata field if this outgoing payment is requested through Open Payments. */
  reason?: InputMaybe<Scalars['String']['input']>;
};

export type CreateAssetInput = {
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  code: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if liquidity falls below this value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** Difference in orders of magnitude between the standard unit of an asset and a corresponding fractional unit */
  scale: Scalars['UInt8']['input'];
  /** Minimum amount of liquidity that can be withdrawn from the asset */
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']['input']>;
};

export type CreateAssetLiquidityWithdrawalInput = {
  /** Amount of withdrawal. */
  amount: Scalars['UInt64']['input'];
  /** The id of the asset to create the withdrawal for. */
  assetId: Scalars['String']['input'];
  /** The id of the withdrawal. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** This is the interval in seconds after a pending transfer's created at which it may be posted or voided. Zero denotes a no timeout single-phase posted transfer. */
  timeoutSeconds: Scalars['UInt64']['input'];
};

export type CreateIncomingPaymentInput = {
  /** Expiration date-time */
  expiresAt?: InputMaybe<Scalars['String']['input']>;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Maximum amount to be received */
  incomingAmount?: InputMaybe<AmountInput>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Id of the wallet address under which the incoming payment will be created */
  walletAddressId: Scalars['String']['input'];
};

export type CreateIncomingPaymentWithdrawalInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the incoming payment to withdraw from. */
  incomingPaymentId: Scalars['String']['input'];
  /** This is the interval in seconds after a pending transfer's created at which it may be posted or voided. Zero denotes a no timeout single-phase posted transfer. */
  timeoutSeconds: Scalars['UInt64']['input'];
};

export type CreateOrUpdatePeerByUrlInput = {
  /** Asset id of peering relationship */
  assetId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if peer liquidity falls below this value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** Amount of liquidity to deposit for peer */
  liquidityToDeposit?: InputMaybe<Scalars['UInt64']['input']>;
  /** Maximum packet amount that the peer accepts */
  maxPacketAmount?: InputMaybe<Scalars['UInt64']['input']>;
  /** Peer's internal name for overriding auto-peer's default naming */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Peer's URL address at which the peer accepts auto-peering requests */
  peerUrl: Scalars['String']['input'];
};

export type CreateOrUpdatePeerByUrlMutationResponse = {
  __typename?: 'CreateOrUpdatePeerByUrlMutationResponse';
  peer?: Maybe<Peer>;
};

export type CreateOutgoingPaymentFromIncomingPaymentInput = {
  /** Amount to send (fixed send) */
  debitAmount: AmountInput;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Incoming payment url to create the outgoing payment from */
  incomingPayment: Scalars['String']['input'];
  /** Additional metadata associated with the outgoing payment. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Id of the wallet address under which the outgoing payment will be created */
  walletAddressId: Scalars['String']['input'];
};

export type CreateOutgoingPaymentInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Additional metadata associated with the outgoing payment. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Id of the corresponding quote for that outgoing payment */
  quoteId: Scalars['String']['input'];
  /** Id of the wallet address under which the outgoing payment will be created */
  walletAddressId: Scalars['String']['input'];
};

export type CreateOutgoingPaymentWithdrawalInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the outgoing payment to withdraw from. */
  outgoingPaymentId: Scalars['String']['input'];
  /** This is the interval in seconds after a pending transfer's created at which it may be posted or voided. Zero denotes a no timeout single-phase posted transfer. */
  timeoutSeconds: Scalars['UInt64']['input'];
};

export type CreatePeerInput = {
  /** Asset id of peering relationship */
  assetId: Scalars['String']['input'];
  /** Peering connection details */
  http: HttpInput;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Initial amount of liquidity to deposit for peer */
  initialLiquidity?: InputMaybe<Scalars['UInt64']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if peer liquidity falls below this value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** Maximum packet amount that the peer accepts */
  maxPacketAmount?: InputMaybe<Scalars['UInt64']['input']>;
  /** Peer's internal name */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Peer's ILP address */
  staticIlpAddress: Scalars['String']['input'];
};

export type CreatePeerLiquidityWithdrawalInput = {
  /** Amount of withdrawal. */
  amount: Scalars['UInt64']['input'];
  /** The id of the withdrawal. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the peer to create the withdrawal for. */
  peerId: Scalars['String']['input'];
  /** This is the interval in seconds after a pending transfer's created at which it may be posted or voided. Zero denotes a no timeout single-phase posted transfer. */
  timeoutSeconds: Scalars['UInt64']['input'];
};

export type CreatePeerMutationResponse = {
  __typename?: 'CreatePeerMutationResponse';
  peer?: Maybe<Peer>;
};

export type CreateQuoteInput = {
  /** Amount to send (fixed send) */
  debitAmount?: InputMaybe<AmountInput>;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Amount to receive (fixed receive) */
  receiveAmount?: InputMaybe<AmountInput>;
  /** Wallet address URL of the receiver */
  receiver: Scalars['String']['input'];
  /** Id of the wallet address under which the quote will be created */
  walletAddressId: Scalars['String']['input'];
};

export type CreateReceiverInput = {
  /** Expiration date-time */
  expiresAt?: InputMaybe<Scalars['String']['input']>;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Maximum amount to be received */
  incomingAmount?: InputMaybe<AmountInput>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Receiving wallet address URL */
  walletAddressUrl: Scalars['String']['input'];
};

export type CreateReceiverResponse = {
  __typename?: 'CreateReceiverResponse';
  receiver?: Maybe<Receiver>;
};

export type CreateWalletAddressInput = {
  /** Additional properties associated with the [walletAddress]. */
  additionalProperties?: InputMaybe<Array<AdditionalPropertyInput>>;
  /** Asset of the wallet address */
  assetId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Public name associated with the wallet address */
  publicName?: InputMaybe<Scalars['String']['input']>;
  /** Wallet Address URL */
  url: Scalars['String']['input'];
};

export type CreateWalletAddressKeyInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Public key */
  jwk: JwkInput;
  walletAddressId: Scalars['String']['input'];
};

export type CreateWalletAddressKeyMutationResponse = {
  __typename?: 'CreateWalletAddressKeyMutationResponse';
  walletAddressKey?: Maybe<WalletAddressKey>;
};

export type CreateWalletAddressMutationResponse = {
  __typename?: 'CreateWalletAddressMutationResponse';
  walletAddress?: Maybe<WalletAddress>;
};

export type CreateWalletAddressWithdrawalInput = {
  /** The id of the withdrawal. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** This is the interval in seconds after a pending transfer's created at which it may be posted or voided. Zero denotes a no timeout single-phase posted transfer. */
  timeoutSeconds: Scalars['UInt64']['input'];
  /** The id of the Open Payments wallet address to create the withdrawal for. */
  walletAddressId: Scalars['String']['input'];
};

export enum Crv {
  Ed25519 = 'Ed25519'
}

export type DeleteAssetInput = {
  /** Asset id */
  id: Scalars['ID']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};

export type DeleteAssetMutationResponse = {
  __typename?: 'DeleteAssetMutationResponse';
  asset?: Maybe<Asset>;
};

export type DeletePeerInput = {
  id: Scalars['ID']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};

export type DeletePeerMutationResponse = {
  __typename?: 'DeletePeerMutationResponse';
  success: Scalars['Boolean']['output'];
};

export type DepositAssetLiquidityInput = {
  /** Amount of liquidity to deposit. */
  amount: Scalars['UInt64']['input'];
  /** The id of the asset to deposit liquidity. */
  assetId: Scalars['String']['input'];
  /** The id of the transfer. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
};

export type DepositEventLiquidityInput = {
  /** The id of the event to deposit into. */
  eventId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
};

export type DepositOutgoingPaymentLiquidityInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the outgoing payment to deposit into. */
  outgoingPaymentId: Scalars['String']['input'];
};

export type DepositPeerLiquidityInput = {
  /** Amount of liquidity to deposit. */
  amount: Scalars['UInt64']['input'];
  /** The id of the transfer. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the peer to deposit liquidity. */
  peerId: Scalars['String']['input'];
};

export type Fee = Model & {
  __typename?: 'Fee';
  /** Asset id associated with the fee */
  assetId: Scalars['ID']['output'];
  /** Basis points fee. 1 basis point = 0.01%, 100 basis points = 1%, 10000 basis points = 100% */
  basisPoints: Scalars['Int']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Fixed fee */
  fixed: Scalars['UInt64']['output'];
  /** Fee id */
  id: Scalars['ID']['output'];
  /** Type of fee (sending or receiving) */
  type: FeeType;
};

export type FeeDetails = {
  /** Basis points fee. Should be between 0 and 10000 (inclusive). 1 basis point = 0.01%, 100 basis points = 1%, 10000 basis points = 100% */
  basisPoints: Scalars['Int']['input'];
  /** A flat fee */
  fixed: Scalars['UInt64']['input'];
};

export type FeeEdge = {
  __typename?: 'FeeEdge';
  cursor: Scalars['String']['output'];
  node: Fee;
};

export enum FeeType {
  /** Receiver pays the fees */
  Receiving = 'RECEIVING',
  /** Sender pays the fees */
  Sending = 'SENDING'
}

export type FeesConnection = {
  __typename?: 'FeesConnection';
  edges: Array<FeeEdge>;
  pageInfo: PageInfo;
};

export type FilterString = {
  in: Array<Scalars['String']['input']>;
};

export type Http = {
  __typename?: 'Http';
  /** Outgoing connection details */
  outgoing: HttpOutgoing;
};

export type HttpIncomingInput = {
  /** Array of auth tokens accepted by this Rafiki instance */
  authTokens: Array<Scalars['String']['input']>;
};

export type HttpInput = {
  /** Incoming connection details */
  incoming?: InputMaybe<HttpIncomingInput>;
  /** Outgoing connection details */
  outgoing: HttpOutgoingInput;
};

export type HttpOutgoing = {
  __typename?: 'HttpOutgoing';
  /** Auth token to present at the peering Rafiki instance */
  authToken: Scalars['String']['output'];
  /** Peer's connection endpoint */
  endpoint: Scalars['String']['output'];
};

export type HttpOutgoingInput = {
  /** Auth token to present at the peering Rafiki instance */
  authToken: Scalars['String']['input'];
  /** Peer's connection endpoint */
  endpoint: Scalars['String']['input'];
};

export type IncomingPayment = BasePayment & Model & {
  __typename?: 'IncomingPayment';
  /** Information about the wallet address of the Open Payments client that created the incoming payment. */
  client?: Maybe<Scalars['String']['output']>;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Date-time of expiry. After this time, the incoming payment will not accept further payments made to it. */
  expiresAt: Scalars['String']['output'];
  /** Incoming Payment id */
  id: Scalars['ID']['output'];
  /** The maximum amount that should be paid into the wallet address under this incoming payment. */
  incomingAmount?: Maybe<Amount>;
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** The total amount that has been paid into the wallet address under this incoming payment. */
  receivedAmount: Amount;
  /** Incoming payment state */
  state: IncomingPaymentState;
  /** Id of the wallet address under which this incoming payment was created. */
  walletAddressId: Scalars['ID']['output'];
};

export type IncomingPaymentConnection = {
  __typename?: 'IncomingPaymentConnection';
  edges: Array<IncomingPaymentEdge>;
  pageInfo: PageInfo;
};

export type IncomingPaymentEdge = {
  __typename?: 'IncomingPaymentEdge';
  cursor: Scalars['String']['output'];
  node: IncomingPayment;
};

export type IncomingPaymentResponse = {
  __typename?: 'IncomingPaymentResponse';
  payment?: Maybe<IncomingPayment>;
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

export type Jwk = {
  __typename?: 'Jwk';
  /** Cryptographic algorithm family used with the key. The only allowed value is `EdDSA`. */
  alg: Alg;
  /** Curve that the key pair is derived from. The only allowed value is `Ed25519`. */
  crv: Crv;
  /** Key id */
  kid: Scalars['String']['output'];
  /** Key type. The only allowed value is `OKP`. */
  kty: Kty;
  /** Base64 url-encoded public key. */
  x: Scalars['String']['output'];
};

export type JwkInput = {
  /** Cryptographic algorithm family used with the key. The only allowed value is `EdDSA`. */
  alg: Alg;
  /** Curve that the key pair is derived from. The only allowed value is `Ed25519`. */
  crv: Crv;
  /** Key id */
  kid: Scalars['String']['input'];
  /** Key type. The only allowed value is `OKP`. */
  kty: Kty;
  /** Base64 url-encoded public key. */
  x: Scalars['String']['input'];
};

export enum Kty {
  Okp = 'OKP'
}

export enum LiquidityError {
  AlreadyPosted = 'AlreadyPosted',
  AlreadyVoided = 'AlreadyVoided',
  AmountZero = 'AmountZero',
  InsufficientBalance = 'InsufficientBalance',
  InvalidId = 'InvalidId',
  TransferExists = 'TransferExists',
  UnknownAsset = 'UnknownAsset',
  UnknownIncomingPayment = 'UnknownIncomingPayment',
  UnknownPayment = 'UnknownPayment',
  UnknownPeer = 'UnknownPeer',
  UnknownTransfer = 'UnknownTransfer',
  UnknownWalletAddress = 'UnknownWalletAddress'
}

export type LiquidityMutationResponse = {
  __typename?: 'LiquidityMutationResponse';
  success: Scalars['Boolean']['output'];
};

export type Model = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Approves the incoming payment if the incoming payment is in the PENDING state */
  approveIncomingPayment: ApproveIncomingPaymentResponse;
  /** Cancel the incoming payment if the incoming payment is in the PENDING state */
  cancelIncomingPayment: CancelIncomingPaymentResponse;
  /** Cancel Outgoing Payment */
  cancelOutgoingPayment: OutgoingPaymentResponse;
  /** Create an asset */
  createAsset: AssetMutationResponse;
  /** Withdraw asset liquidity */
  createAssetLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create an internal Open Payments Incoming Payment. The receiver has a wallet address on this Rafiki instance. */
  createIncomingPayment: IncomingPaymentResponse;
  /** Withdraw incoming payment liquidity */
  createIncomingPaymentWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create a peer using a URL */
  createOrUpdatePeerByUrl: CreateOrUpdatePeerByUrlMutationResponse;
  /** Create an Open Payments Outgoing Payment */
  createOutgoingPayment: OutgoingPaymentResponse;
  /** Create an Open Payments Outgoing Payment from an incoming payment */
  createOutgoingPaymentFromIncomingPayment: OutgoingPaymentResponse;
  /** Withdraw outgoing payment liquidity */
  createOutgoingPaymentWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create a peer */
  createPeer: CreatePeerMutationResponse;
  /** Withdraw peer liquidity */
  createPeerLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create an Open Payments Quote */
  createQuote: QuoteResponse;
  /** Create an internal or external Open Payments Incoming Payment. The receiver has a wallet address on either this or another Open Payments resource server. */
  createReceiver: CreateReceiverResponse;
  /** Create a wallet address */
  createWalletAddress: CreateWalletAddressMutationResponse;
  /** Add a public key to a wallet address that is used to verify Open Payments requests. */
  createWalletAddressKey?: Maybe<CreateWalletAddressKeyMutationResponse>;
  /** Withdraw liquidity from a wallet address received via Web Monetization. */
  createWalletAddressWithdrawal?: Maybe<WalletAddressWithdrawalMutationResponse>;
  /** Delete an asset */
  deleteAsset: DeleteAssetMutationResponse;
  /** Delete a peer */
  deletePeer: DeletePeerMutationResponse;
  /** Deposit asset liquidity */
  depositAssetLiquidity?: Maybe<LiquidityMutationResponse>;
  /**
   * Deposit webhook event liquidity
   * @deprecated Use `depositOutgoingPaymentLiquidity`
   */
  depositEventLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Deposit outgoing payment liquidity */
  depositOutgoingPaymentLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Deposit peer liquidity */
  depositPeerLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Post liquidity withdrawal. Withdrawals are two-phase commits and are committed via this mutation. */
  postLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Revoke a public key associated with a wallet address. Open Payment requests using this key for request signatures will be denied going forward. */
  revokeWalletAddressKey?: Maybe<RevokeWalletAddressKeyMutationResponse>;
  /** Set the fee on an asset */
  setFee: SetFeeResponse;
  /** If automatic withdrawal of funds received via Web Monetization by the wallet address are disabled, this mutation can be used to trigger up to n withdrawal events. */
  triggerWalletAddressEvents: TriggerWalletAddressEventsMutationResponse;
  /** Update an asset */
  updateAsset: AssetMutationResponse;
  /** Update a peer */
  updatePeer: UpdatePeerMutationResponse;
  /** Update a wallet address */
  updateWalletAddress: UpdateWalletAddressMutationResponse;
  /** Void liquidity withdrawal. Withdrawals are two-phase commits and are rolled back via this mutation. */
  voidLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /**
   * Withdraw webhook event liquidity
   * @deprecated Use `createOutgoingPaymentWithdrawal, createIncomingPaymentWithdrawal, or createWalletAddressWithdrawal`
   */
  withdrawEventLiquidity?: Maybe<LiquidityMutationResponse>;
};


export type MutationApproveIncomingPaymentArgs = {
  input: ApproveIncomingPaymentInput;
};


export type MutationCancelIncomingPaymentArgs = {
  input: CancelIncomingPaymentInput;
};


export type MutationCancelOutgoingPaymentArgs = {
  input: CancelOutgoingPaymentInput;
};


export type MutationCreateAssetArgs = {
  input: CreateAssetInput;
};


export type MutationCreateAssetLiquidityWithdrawalArgs = {
  input: CreateAssetLiquidityWithdrawalInput;
};


export type MutationCreateIncomingPaymentArgs = {
  input: CreateIncomingPaymentInput;
};


export type MutationCreateIncomingPaymentWithdrawalArgs = {
  input: CreateIncomingPaymentWithdrawalInput;
};


export type MutationCreateOrUpdatePeerByUrlArgs = {
  input: CreateOrUpdatePeerByUrlInput;
};


export type MutationCreateOutgoingPaymentArgs = {
  input: CreateOutgoingPaymentInput;
};


export type MutationCreateOutgoingPaymentFromIncomingPaymentArgs = {
  input: CreateOutgoingPaymentFromIncomingPaymentInput;
};


export type MutationCreateOutgoingPaymentWithdrawalArgs = {
  input: CreateOutgoingPaymentWithdrawalInput;
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


export type MutationCreateReceiverArgs = {
  input: CreateReceiverInput;
};


export type MutationCreateWalletAddressArgs = {
  input: CreateWalletAddressInput;
};


export type MutationCreateWalletAddressKeyArgs = {
  input: CreateWalletAddressKeyInput;
};


export type MutationCreateWalletAddressWithdrawalArgs = {
  input: CreateWalletAddressWithdrawalInput;
};


export type MutationDeleteAssetArgs = {
  input: DeleteAssetInput;
};


export type MutationDeletePeerArgs = {
  input: DeletePeerInput;
};


export type MutationDepositAssetLiquidityArgs = {
  input: DepositAssetLiquidityInput;
};


export type MutationDepositEventLiquidityArgs = {
  input: DepositEventLiquidityInput;
};


export type MutationDepositOutgoingPaymentLiquidityArgs = {
  input: DepositOutgoingPaymentLiquidityInput;
};


export type MutationDepositPeerLiquidityArgs = {
  input: DepositPeerLiquidityInput;
};


export type MutationPostLiquidityWithdrawalArgs = {
  input: PostLiquidityWithdrawalInput;
};


export type MutationRevokeWalletAddressKeyArgs = {
  input: RevokeWalletAddressKeyInput;
};


export type MutationSetFeeArgs = {
  input: SetFeeInput;
};


export type MutationTriggerWalletAddressEventsArgs = {
  input: TriggerWalletAddressEventsInput;
};


export type MutationUpdateAssetArgs = {
  input: UpdateAssetInput;
};


export type MutationUpdatePeerArgs = {
  input: UpdatePeerInput;
};


export type MutationUpdateWalletAddressArgs = {
  input: UpdateWalletAddressInput;
};


export type MutationVoidLiquidityWithdrawalArgs = {
  input: VoidLiquidityWithdrawalInput;
};


export type MutationWithdrawEventLiquidityArgs = {
  input: WithdrawEventLiquidityInput;
};

export type OutgoingPayment = BasePayment & Model & {
  __typename?: 'OutgoingPayment';
  /** Information about the wallet address of the Open Payments client that created the outgoing payment. */
  client?: Maybe<Scalars['String']['output']>;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Amount to send (fixed send) */
  debitAmount: Amount;
  error?: Maybe<Scalars['String']['output']>;
  /** Id of the Grant under which this outgoing payment was created */
  grantId?: Maybe<Scalars['String']['output']>;
  /** Outgoing payment id */
  id: Scalars['ID']['output'];
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** Additional metadata associated with the outgoing payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Quote for this outgoing payment */
  quote?: Maybe<Quote>;
  /** Amount to receive (fixed receive) */
  receiveAmount: Amount;
  /** Wallet address URL of the receiver */
  receiver: Scalars['String']['output'];
  /** Amount already sent */
  sentAmount: Amount;
  /** Outgoing payment state */
  state: OutgoingPaymentState;
  stateAttempts: Scalars['Int']['output'];
  /** Id of the wallet address under which this outgoing payment was created */
  walletAddressId: Scalars['ID']['output'];
};

export type OutgoingPaymentConnection = {
  __typename?: 'OutgoingPaymentConnection';
  edges: Array<OutgoingPaymentEdge>;
  pageInfo: PageInfo;
};

export type OutgoingPaymentEdge = {
  __typename?: 'OutgoingPaymentEdge';
  cursor: Scalars['String']['output'];
  node: OutgoingPayment;
};

export type OutgoingPaymentFilter = {
  receiver?: InputMaybe<FilterString>;
  state?: InputMaybe<FilterString>;
  walletAddressId?: InputMaybe<FilterString>;
};

export type OutgoingPaymentResponse = {
  __typename?: 'OutgoingPaymentResponse';
  payment?: Maybe<OutgoingPayment>;
};

export enum OutgoingPaymentState {
  /** Payment cancelled */
  Cancelled = 'CANCELLED',
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
  endCursor?: Maybe<Scalars['String']['output']>;
  /** Paginating forwards: Are there more pages? */
  hasNextPage: Scalars['Boolean']['output'];
  /** Paginating backwards: Are there more pages? */
  hasPreviousPage: Scalars['Boolean']['output'];
  /** Paginating backwards: the cursor to continue. */
  startCursor?: Maybe<Scalars['String']['output']>;
};

export type Payment = BasePayment & Model & {
  __typename?: 'Payment';
  /** Information about the wallet address of the Open Payments client that created the payment. */
  client?: Maybe<Scalars['String']['output']>;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Payment id */
  id: Scalars['ID']['output'];
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** Additional metadata associated with the payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Either the IncomingPaymentState or OutgoingPaymentState according to type */
  state: Scalars['String']['output'];
  /** Type of payment */
  type: PaymentType;
  /** Id of the wallet address under which this payment was created */
  walletAddressId: Scalars['ID']['output'];
};

export type PaymentConnection = {
  __typename?: 'PaymentConnection';
  edges: Array<PaymentEdge>;
  pageInfo: PageInfo;
};

export type PaymentEdge = {
  __typename?: 'PaymentEdge';
  cursor: Scalars['String']['output'];
  node: Payment;
};

export type PaymentFilter = {
  type?: InputMaybe<FilterString>;
  walletAddressId?: InputMaybe<FilterString>;
};

export enum PaymentType {
  Incoming = 'INCOMING',
  Outgoing = 'OUTGOING'
}

export type Peer = Model & {
  __typename?: 'Peer';
  /** Asset of peering relationship */
  asset: Asset;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Peering connection details */
  http: Http;
  /** Peer id */
  id: Scalars['ID']['output'];
  /** Incoming tokens */
  incomingTokens?: Maybe<Array<Scalars['String']['output']>>;
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** Account Servicing Entity will be notified via a webhook event if peer liquidity falls below this value */
  liquidityThreshold?: Maybe<Scalars['UInt64']['output']>;
  /** Maximum packet amount that the peer accepts */
  maxPacketAmount?: Maybe<Scalars['UInt64']['output']>;
  /** Peer's public name */
  name?: Maybe<Scalars['String']['output']>;
  /** Peer's ILP address */
  staticIlpAddress: Scalars['String']['output'];
};

export type PeerEdge = {
  __typename?: 'PeerEdge';
  cursor: Scalars['String']['output'];
  node: Peer;
};

export type PeersConnection = {
  __typename?: 'PeersConnection';
  edges: Array<PeerEdge>;
  pageInfo: PageInfo;
};

export type PostLiquidityWithdrawalInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the liquidity withdrawal to post. */
  withdrawalId: Scalars['String']['input'];
};

export type Query = {
  __typename?: 'Query';
  /** Fetch a page of accounting transfers */
  accountingTransfers: AccountingTransferConnection;
  /** Fetch an asset */
  asset?: Maybe<Asset>;
  /** Fetch a page of assets. */
  assets: AssetsConnection;
  /** Fetch an Open Payments incoming payment */
  incomingPayment?: Maybe<IncomingPayment>;
  /** Fetch an Open Payments outgoing payment */
  outgoingPayment?: Maybe<OutgoingPayment>;
  /** Fetch a page of outgoing payments by receiver */
  outgoingPayments: OutgoingPaymentConnection;
  /** Fetch a page of combined payments */
  payments: PaymentConnection;
  /** Fetch a peer */
  peer?: Maybe<Peer>;
  /** Fetch a page of peers. */
  peers: PeersConnection;
  /** Fetch an Open Payments quote */
  quote?: Maybe<Quote>;
  /** Get an local or remote Open Payments Incoming Payment. The receiver has a wallet address on either this or another Open Payments resource server. */
  receiver?: Maybe<Receiver>;
  /** Fetch a wallet address. */
  walletAddress?: Maybe<WalletAddress>;
  /** Fetch a page of wallet addresses. */
  walletAddresses: WalletAddressesConnection;
  /** Fetch a page of webhook events */
  webhookEvents: WebhookEventsConnection;
};


export type QueryAccountingTransfersArgs = {
  id: Scalars['String']['input'];
  limit?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryAssetArgs = {
  id: Scalars['String']['input'];
};


export type QueryAssetsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type QueryIncomingPaymentArgs = {
  id: Scalars['String']['input'];
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String']['input'];
};


export type QueryOutgoingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<OutgoingPaymentFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type QueryPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PaymentFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type QueryPeerArgs = {
  id: Scalars['String']['input'];
};


export type QueryPeersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type QueryQuoteArgs = {
  id: Scalars['String']['input'];
};


export type QueryReceiverArgs = {
  id: Scalars['String']['input'];
};


export type QueryWalletAddressArgs = {
  id: Scalars['String']['input'];
};


export type QueryWalletAddressesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type QueryWebhookEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<WebhookEventFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};

export type Quote = {
  __typename?: 'Quote';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Amount to send (fixed send) */
  debitAmount: Amount;
  /** Estimated exchange rate */
  estimatedExchangeRate?: Maybe<Scalars['Float']['output']>;
  /** Date-time of expiration */
  expiresAt: Scalars['String']['output'];
  /** Quote id */
  id: Scalars['ID']['output'];
  /** Amount to receive (fixed receive) */
  receiveAmount: Amount;
  /** Wallet address URL of the receiver */
  receiver: Scalars['String']['output'];
  /** Id of the wallet address under which this quote was created */
  walletAddressId: Scalars['ID']['output'];
};

export type QuoteConnection = {
  __typename?: 'QuoteConnection';
  edges: Array<QuoteEdge>;
  pageInfo: PageInfo;
};

export type QuoteEdge = {
  __typename?: 'QuoteEdge';
  cursor: Scalars['String']['output'];
  node: Quote;
};

export type QuoteResponse = {
  __typename?: 'QuoteResponse';
  quote?: Maybe<Quote>;
};

export type Receiver = {
  __typename?: 'Receiver';
  /** Describes whether the incoming payment has completed receiving funds. */
  completed: Scalars['Boolean']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Date-time of expiry. After this time, the incoming payment will accept further payments made to it. */
  expiresAt?: Maybe<Scalars['String']['output']>;
  /** Incoming payment URL */
  id: Scalars['String']['output'];
  /** The maximum amount that should be paid into the wallet address under this incoming payment. */
  incomingAmount?: Maybe<Amount>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** The total amount that has been paid into the wallet address under this incoming payment. */
  receivedAmount: Amount;
  /** Date-time of last update */
  updatedAt: Scalars['String']['output'];
  /** Wallet address URL under which the incoming payment was created */
  walletAddressUrl: Scalars['String']['output'];
};

export type RevokeWalletAddressKeyInput = {
  /** Internal id of key */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};

export type RevokeWalletAddressKeyMutationResponse = {
  __typename?: 'RevokeWalletAddressKeyMutationResponse';
  walletAddressKey?: Maybe<WalletAddressKey>;
};

export type SetFeeInput = {
  /** Asset id to add the fee to */
  assetId: Scalars['ID']['input'];
  /** Fee values */
  fee: FeeDetails;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Type of fee (sending or receiving) */
  type: FeeType;
};

export type SetFeeResponse = {
  __typename?: 'SetFeeResponse';
  fee?: Maybe<Fee>;
};

export enum SortOrder {
  /** Choose ascending order for results. */
  Asc = 'ASC',
  /** Choose descending order for results. */
  Desc = 'DESC'
}

export enum TransferType {
  /** Deposit transfer type. */
  Deposit = 'DEPOSIT',
  /** Transfer type. */
  Transfer = 'TRANSFER',
  /** Withdrawal transfer type. */
  Withdrawal = 'WITHDRAWAL'
}

export type TriggerWalletAddressEventsInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Maximum number of events being triggered (n). */
  limit: Scalars['Int']['input'];
};

export type TriggerWalletAddressEventsMutationResponse = {
  __typename?: 'TriggerWalletAddressEventsMutationResponse';
  /** Number of events triggered */
  count?: Maybe<Scalars['Int']['output']>;
};

export type UpdateAssetInput = {
  /** Asset id */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if liquidity falls below this new value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** New minimum amount of liquidity that can be withdrawn from the asset */
  withdrawalThreshold?: InputMaybe<Scalars['UInt64']['input']>;
};

export type UpdatePeerInput = {
  /** New peering connection details */
  http?: InputMaybe<HttpInput>;
  /** Peer id */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if peer liquidity falls below this new value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** New maximum packet amount that the peer accepts */
  maxPacketAmount?: InputMaybe<Scalars['UInt64']['input']>;
  /** Peer's new public name */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Peer's new ILP address */
  staticIlpAddress?: InputMaybe<Scalars['String']['input']>;
};

export type UpdatePeerMutationResponse = {
  __typename?: 'UpdatePeerMutationResponse';
  peer?: Maybe<Peer>;
};

export type UpdateWalletAddressInput = {
  /** List additional properties associated with this wallet address. */
  additionalProperties?: InputMaybe<Array<AdditionalPropertyInput>>;
  /** ID of wallet address to update */
  id: Scalars['ID']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** New public name for wallet address */
  publicName?: InputMaybe<Scalars['String']['input']>;
  /** New status to set the wallet address to */
  status?: InputMaybe<WalletAddressStatus>;
};

export type UpdateWalletAddressMutationResponse = {
  __typename?: 'UpdateWalletAddressMutationResponse';
  walletAddress?: Maybe<WalletAddress>;
};

export type VoidLiquidityWithdrawalInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the liquidity withdrawal to void. */
  withdrawalId: Scalars['String']['input'];
};

export type WalletAddress = Model & {
  __typename?: 'WalletAddress';
  /** List additional properties associated with this wallet address. */
  additionalProperties?: Maybe<Array<Maybe<AdditionalProperty>>>;
  /** Asset of the wallet address */
  asset: Asset;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Wallet address id */
  id: Scalars['ID']['output'];
  /** List of incoming payments received by this wallet address */
  incomingPayments?: Maybe<IncomingPaymentConnection>;
  /** Available liquidity */
  liquidity?: Maybe<Scalars['UInt64']['output']>;
  /** List of outgoing payments sent from this wallet address */
  outgoingPayments?: Maybe<OutgoingPaymentConnection>;
  /** Public name associated with the wallet address */
  publicName?: Maybe<Scalars['String']['output']>;
  /** List of quotes created at this wallet address */
  quotes?: Maybe<QuoteConnection>;
  /** Status of the wallet address */
  status: WalletAddressStatus;
  /** Wallet Address URL */
  url: Scalars['String']['output'];
  /** List of keys associated with this wallet address */
  walletAddressKeys?: Maybe<WalletAddressKeyConnection>;
};


export type WalletAddressIncomingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type WalletAddressOutgoingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type WalletAddressQuotesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};


export type WalletAddressWalletAddressKeysArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  sortOrder?: InputMaybe<SortOrder>;
};

export type WalletAddressEdge = {
  __typename?: 'WalletAddressEdge';
  cursor: Scalars['String']['output'];
  node: WalletAddress;
};

export type WalletAddressKey = Model & {
  __typename?: 'WalletAddressKey';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Internal id of key */
  id: Scalars['ID']['output'];
  /** Public key */
  jwk: Jwk;
  /** Indicator whether the key has been revoked */
  revoked: Scalars['Boolean']['output'];
  /** Id of the wallet address to which this key belongs to */
  walletAddressId: Scalars['ID']['output'];
};

export type WalletAddressKeyConnection = {
  __typename?: 'WalletAddressKeyConnection';
  edges: Array<WalletAddressKeyEdge>;
  pageInfo: PageInfo;
};

export type WalletAddressKeyEdge = {
  __typename?: 'WalletAddressKeyEdge';
  cursor: Scalars['String']['output'];
  node: WalletAddressKey;
};

export enum WalletAddressStatus {
  /** Default status */
  Active = 'ACTIVE',
  /** Status after deactivating */
  Inactive = 'INACTIVE'
}

export type WalletAddressWithdrawal = {
  __typename?: 'WalletAddressWithdrawal';
  /** Amount to withdraw */
  amount: Scalars['UInt64']['output'];
  /** Withdrawal Id */
  id: Scalars['ID']['output'];
  /** Wallet address details */
  walletAddress: WalletAddress;
};

export type WalletAddressWithdrawalMutationResponse = {
  __typename?: 'WalletAddressWithdrawalMutationResponse';
  withdrawal?: Maybe<WalletAddressWithdrawal>;
};

export type WalletAddressesConnection = {
  __typename?: 'WalletAddressesConnection';
  edges: Array<WalletAddressEdge>;
  pageInfo: PageInfo;
};

export type WebhookEvent = Model & {
  __typename?: 'WebhookEvent';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Stringified JSON data */
  data: Scalars['JSONObject']['output'];
  /** Event id */
  id: Scalars['ID']['output'];
  /** Type of event */
  type: Scalars['String']['output'];
};

export type WebhookEventFilter = {
  type?: InputMaybe<FilterString>;
};

export type WebhookEventsConnection = {
  __typename?: 'WebhookEventsConnection';
  edges: Array<WebhookEventsEdge>;
  pageInfo: PageInfo;
};

export type WebhookEventsEdge = {
  __typename?: 'WebhookEventsEdge';
  cursor: Scalars['String']['output'];
  node: WebhookEvent;
};

export type WithdrawEventLiquidityInput = {
  /** The id of the event to withdraw from. */
  eventId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
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
  BasePayment: ( Partial<IncomingPayment> ) | ( Partial<OutgoingPayment> ) | ( Partial<Payment> );
  Model: ( Partial<AccountingTransfer> ) | ( Partial<Asset> ) | ( Partial<Fee> ) | ( Partial<IncomingPayment> ) | ( Partial<OutgoingPayment> ) | ( Partial<Payment> ) | ( Partial<Peer> ) | ( Partial<WalletAddress> ) | ( Partial<WalletAddressKey> ) | ( Partial<WebhookEvent> );
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AccountingTransfer: ResolverTypeWrapper<Partial<AccountingTransfer>>;
  AccountingTransferConnection: ResolverTypeWrapper<Partial<AccountingTransferConnection>>;
  AdditionalProperty: ResolverTypeWrapper<Partial<AdditionalProperty>>;
  AdditionalPropertyInput: ResolverTypeWrapper<Partial<AdditionalPropertyInput>>;
  Alg: ResolverTypeWrapper<Partial<Alg>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  AmountInput: ResolverTypeWrapper<Partial<AmountInput>>;
  ApproveIncomingPaymentInput: ResolverTypeWrapper<Partial<ApproveIncomingPaymentInput>>;
  ApproveIncomingPaymentResponse: ResolverTypeWrapper<Partial<ApproveIncomingPaymentResponse>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  AssetEdge: ResolverTypeWrapper<Partial<AssetEdge>>;
  AssetMutationResponse: ResolverTypeWrapper<Partial<AssetMutationResponse>>;
  AssetsConnection: ResolverTypeWrapper<Partial<AssetsConnection>>;
  BasePayment: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['BasePayment']>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  CancelIncomingPaymentInput: ResolverTypeWrapper<Partial<CancelIncomingPaymentInput>>;
  CancelIncomingPaymentResponse: ResolverTypeWrapper<Partial<CancelIncomingPaymentResponse>>;
  CancelOutgoingPaymentInput: ResolverTypeWrapper<Partial<CancelOutgoingPaymentInput>>;
  CreateAssetInput: ResolverTypeWrapper<Partial<CreateAssetInput>>;
  CreateAssetLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreateAssetLiquidityWithdrawalInput>>;
  CreateIncomingPaymentInput: ResolverTypeWrapper<Partial<CreateIncomingPaymentInput>>;
  CreateIncomingPaymentWithdrawalInput: ResolverTypeWrapper<Partial<CreateIncomingPaymentWithdrawalInput>>;
  CreateOrUpdatePeerByUrlInput: ResolverTypeWrapper<Partial<CreateOrUpdatePeerByUrlInput>>;
  CreateOrUpdatePeerByUrlMutationResponse: ResolverTypeWrapper<Partial<CreateOrUpdatePeerByUrlMutationResponse>>;
  CreateOutgoingPaymentFromIncomingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentFromIncomingPaymentInput>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  CreateOutgoingPaymentWithdrawalInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentWithdrawalInput>>;
  CreatePeerInput: ResolverTypeWrapper<Partial<CreatePeerInput>>;
  CreatePeerLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreatePeerLiquidityWithdrawalInput>>;
  CreatePeerMutationResponse: ResolverTypeWrapper<Partial<CreatePeerMutationResponse>>;
  CreateQuoteInput: ResolverTypeWrapper<Partial<CreateQuoteInput>>;
  CreateReceiverInput: ResolverTypeWrapper<Partial<CreateReceiverInput>>;
  CreateReceiverResponse: ResolverTypeWrapper<Partial<CreateReceiverResponse>>;
  CreateWalletAddressInput: ResolverTypeWrapper<Partial<CreateWalletAddressInput>>;
  CreateWalletAddressKeyInput: ResolverTypeWrapper<Partial<CreateWalletAddressKeyInput>>;
  CreateWalletAddressKeyMutationResponse: ResolverTypeWrapper<Partial<CreateWalletAddressKeyMutationResponse>>;
  CreateWalletAddressMutationResponse: ResolverTypeWrapper<Partial<CreateWalletAddressMutationResponse>>;
  CreateWalletAddressWithdrawalInput: ResolverTypeWrapper<Partial<CreateWalletAddressWithdrawalInput>>;
  Crv: ResolverTypeWrapper<Partial<Crv>>;
  DeleteAssetInput: ResolverTypeWrapper<Partial<DeleteAssetInput>>;
  DeleteAssetMutationResponse: ResolverTypeWrapper<Partial<DeleteAssetMutationResponse>>;
  DeletePeerInput: ResolverTypeWrapper<Partial<DeletePeerInput>>;
  DeletePeerMutationResponse: ResolverTypeWrapper<Partial<DeletePeerMutationResponse>>;
  DepositAssetLiquidityInput: ResolverTypeWrapper<Partial<DepositAssetLiquidityInput>>;
  DepositEventLiquidityInput: ResolverTypeWrapper<Partial<DepositEventLiquidityInput>>;
  DepositOutgoingPaymentLiquidityInput: ResolverTypeWrapper<Partial<DepositOutgoingPaymentLiquidityInput>>;
  DepositPeerLiquidityInput: ResolverTypeWrapper<Partial<DepositPeerLiquidityInput>>;
  Fee: ResolverTypeWrapper<Partial<Fee>>;
  FeeDetails: ResolverTypeWrapper<Partial<FeeDetails>>;
  FeeEdge: ResolverTypeWrapper<Partial<FeeEdge>>;
  FeeType: ResolverTypeWrapper<Partial<FeeType>>;
  FeesConnection: ResolverTypeWrapper<Partial<FeesConnection>>;
  FilterString: ResolverTypeWrapper<Partial<FilterString>>;
  Float: ResolverTypeWrapper<Partial<Scalars['Float']['output']>>;
  Http: ResolverTypeWrapper<Partial<Http>>;
  HttpIncomingInput: ResolverTypeWrapper<Partial<HttpIncomingInput>>;
  HttpInput: ResolverTypeWrapper<Partial<HttpInput>>;
  HttpOutgoing: ResolverTypeWrapper<Partial<HttpOutgoing>>;
  HttpOutgoingInput: ResolverTypeWrapper<Partial<HttpOutgoingInput>>;
  ID: ResolverTypeWrapper<Partial<Scalars['ID']['output']>>;
  IncomingPayment: ResolverTypeWrapper<Partial<IncomingPayment>>;
  IncomingPaymentConnection: ResolverTypeWrapper<Partial<IncomingPaymentConnection>>;
  IncomingPaymentEdge: ResolverTypeWrapper<Partial<IncomingPaymentEdge>>;
  IncomingPaymentResponse: ResolverTypeWrapper<Partial<IncomingPaymentResponse>>;
  IncomingPaymentState: ResolverTypeWrapper<Partial<IncomingPaymentState>>;
  Int: ResolverTypeWrapper<Partial<Scalars['Int']['output']>>;
  JSONObject: ResolverTypeWrapper<Partial<Scalars['JSONObject']['output']>>;
  Jwk: ResolverTypeWrapper<Partial<Jwk>>;
  JwkInput: ResolverTypeWrapper<Partial<JwkInput>>;
  Kty: ResolverTypeWrapper<Partial<Kty>>;
  LiquidityError: ResolverTypeWrapper<Partial<LiquidityError>>;
  LiquidityMutationResponse: ResolverTypeWrapper<Partial<LiquidityMutationResponse>>;
  Model: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['Model']>;
  Mutation: ResolverTypeWrapper<{}>;
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentConnection: ResolverTypeWrapper<Partial<OutgoingPaymentConnection>>;
  OutgoingPaymentEdge: ResolverTypeWrapper<Partial<OutgoingPaymentEdge>>;
  OutgoingPaymentFilter: ResolverTypeWrapper<Partial<OutgoingPaymentFilter>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  OutgoingPaymentState: ResolverTypeWrapper<Partial<OutgoingPaymentState>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Payment: ResolverTypeWrapper<Partial<Payment>>;
  PaymentConnection: ResolverTypeWrapper<Partial<PaymentConnection>>;
  PaymentEdge: ResolverTypeWrapper<Partial<PaymentEdge>>;
  PaymentFilter: ResolverTypeWrapper<Partial<PaymentFilter>>;
  PaymentType: ResolverTypeWrapper<Partial<PaymentType>>;
  Peer: ResolverTypeWrapper<Partial<Peer>>;
  PeerEdge: ResolverTypeWrapper<Partial<PeerEdge>>;
  PeersConnection: ResolverTypeWrapper<Partial<PeersConnection>>;
  PostLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<PostLiquidityWithdrawalInput>>;
  Query: ResolverTypeWrapper<{}>;
  Quote: ResolverTypeWrapper<Partial<Quote>>;
  QuoteConnection: ResolverTypeWrapper<Partial<QuoteConnection>>;
  QuoteEdge: ResolverTypeWrapper<Partial<QuoteEdge>>;
  QuoteResponse: ResolverTypeWrapper<Partial<QuoteResponse>>;
  Receiver: ResolverTypeWrapper<Partial<Receiver>>;
  RevokeWalletAddressKeyInput: ResolverTypeWrapper<Partial<RevokeWalletAddressKeyInput>>;
  RevokeWalletAddressKeyMutationResponse: ResolverTypeWrapper<Partial<RevokeWalletAddressKeyMutationResponse>>;
  SetFeeInput: ResolverTypeWrapper<Partial<SetFeeInput>>;
  SetFeeResponse: ResolverTypeWrapper<Partial<SetFeeResponse>>;
  SortOrder: ResolverTypeWrapper<Partial<SortOrder>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  TransferType: ResolverTypeWrapper<Partial<TransferType>>;
  TriggerWalletAddressEventsInput: ResolverTypeWrapper<Partial<TriggerWalletAddressEventsInput>>;
  TriggerWalletAddressEventsMutationResponse: ResolverTypeWrapper<Partial<TriggerWalletAddressEventsMutationResponse>>;
  UInt8: ResolverTypeWrapper<Partial<Scalars['UInt8']['output']>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']['output']>>;
  UpdateAssetInput: ResolverTypeWrapper<Partial<UpdateAssetInput>>;
  UpdatePeerInput: ResolverTypeWrapper<Partial<UpdatePeerInput>>;
  UpdatePeerMutationResponse: ResolverTypeWrapper<Partial<UpdatePeerMutationResponse>>;
  UpdateWalletAddressInput: ResolverTypeWrapper<Partial<UpdateWalletAddressInput>>;
  UpdateWalletAddressMutationResponse: ResolverTypeWrapper<Partial<UpdateWalletAddressMutationResponse>>;
  VoidLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<VoidLiquidityWithdrawalInput>>;
  WalletAddress: ResolverTypeWrapper<Partial<WalletAddress>>;
  WalletAddressEdge: ResolverTypeWrapper<Partial<WalletAddressEdge>>;
  WalletAddressKey: ResolverTypeWrapper<Partial<WalletAddressKey>>;
  WalletAddressKeyConnection: ResolverTypeWrapper<Partial<WalletAddressKeyConnection>>;
  WalletAddressKeyEdge: ResolverTypeWrapper<Partial<WalletAddressKeyEdge>>;
  WalletAddressStatus: ResolverTypeWrapper<Partial<WalletAddressStatus>>;
  WalletAddressWithdrawal: ResolverTypeWrapper<Partial<WalletAddressWithdrawal>>;
  WalletAddressWithdrawalMutationResponse: ResolverTypeWrapper<Partial<WalletAddressWithdrawalMutationResponse>>;
  WalletAddressesConnection: ResolverTypeWrapper<Partial<WalletAddressesConnection>>;
  WebhookEvent: ResolverTypeWrapper<Partial<WebhookEvent>>;
  WebhookEventFilter: ResolverTypeWrapper<Partial<WebhookEventFilter>>;
  WebhookEventsConnection: ResolverTypeWrapper<Partial<WebhookEventsConnection>>;
  WebhookEventsEdge: ResolverTypeWrapper<Partial<WebhookEventsEdge>>;
  WithdrawEventLiquidityInput: ResolverTypeWrapper<Partial<WithdrawEventLiquidityInput>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AccountingTransfer: Partial<AccountingTransfer>;
  AccountingTransferConnection: Partial<AccountingTransferConnection>;
  AdditionalProperty: Partial<AdditionalProperty>;
  AdditionalPropertyInput: Partial<AdditionalPropertyInput>;
  Amount: Partial<Amount>;
  AmountInput: Partial<AmountInput>;
  ApproveIncomingPaymentInput: Partial<ApproveIncomingPaymentInput>;
  ApproveIncomingPaymentResponse: Partial<ApproveIncomingPaymentResponse>;
  Asset: Partial<Asset>;
  AssetEdge: Partial<AssetEdge>;
  AssetMutationResponse: Partial<AssetMutationResponse>;
  AssetsConnection: Partial<AssetsConnection>;
  BasePayment: ResolversInterfaceTypes<ResolversParentTypes>['BasePayment'];
  Boolean: Partial<Scalars['Boolean']['output']>;
  CancelIncomingPaymentInput: Partial<CancelIncomingPaymentInput>;
  CancelIncomingPaymentResponse: Partial<CancelIncomingPaymentResponse>;
  CancelOutgoingPaymentInput: Partial<CancelOutgoingPaymentInput>;
  CreateAssetInput: Partial<CreateAssetInput>;
  CreateAssetLiquidityWithdrawalInput: Partial<CreateAssetLiquidityWithdrawalInput>;
  CreateIncomingPaymentInput: Partial<CreateIncomingPaymentInput>;
  CreateIncomingPaymentWithdrawalInput: Partial<CreateIncomingPaymentWithdrawalInput>;
  CreateOrUpdatePeerByUrlInput: Partial<CreateOrUpdatePeerByUrlInput>;
  CreateOrUpdatePeerByUrlMutationResponse: Partial<CreateOrUpdatePeerByUrlMutationResponse>;
  CreateOutgoingPaymentFromIncomingPaymentInput: Partial<CreateOutgoingPaymentFromIncomingPaymentInput>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  CreateOutgoingPaymentWithdrawalInput: Partial<CreateOutgoingPaymentWithdrawalInput>;
  CreatePeerInput: Partial<CreatePeerInput>;
  CreatePeerLiquidityWithdrawalInput: Partial<CreatePeerLiquidityWithdrawalInput>;
  CreatePeerMutationResponse: Partial<CreatePeerMutationResponse>;
  CreateQuoteInput: Partial<CreateQuoteInput>;
  CreateReceiverInput: Partial<CreateReceiverInput>;
  CreateReceiverResponse: Partial<CreateReceiverResponse>;
  CreateWalletAddressInput: Partial<CreateWalletAddressInput>;
  CreateWalletAddressKeyInput: Partial<CreateWalletAddressKeyInput>;
  CreateWalletAddressKeyMutationResponse: Partial<CreateWalletAddressKeyMutationResponse>;
  CreateWalletAddressMutationResponse: Partial<CreateWalletAddressMutationResponse>;
  CreateWalletAddressWithdrawalInput: Partial<CreateWalletAddressWithdrawalInput>;
  DeleteAssetInput: Partial<DeleteAssetInput>;
  DeleteAssetMutationResponse: Partial<DeleteAssetMutationResponse>;
  DeletePeerInput: Partial<DeletePeerInput>;
  DeletePeerMutationResponse: Partial<DeletePeerMutationResponse>;
  DepositAssetLiquidityInput: Partial<DepositAssetLiquidityInput>;
  DepositEventLiquidityInput: Partial<DepositEventLiquidityInput>;
  DepositOutgoingPaymentLiquidityInput: Partial<DepositOutgoingPaymentLiquidityInput>;
  DepositPeerLiquidityInput: Partial<DepositPeerLiquidityInput>;
  Fee: Partial<Fee>;
  FeeDetails: Partial<FeeDetails>;
  FeeEdge: Partial<FeeEdge>;
  FeesConnection: Partial<FeesConnection>;
  FilterString: Partial<FilterString>;
  Float: Partial<Scalars['Float']['output']>;
  Http: Partial<Http>;
  HttpIncomingInput: Partial<HttpIncomingInput>;
  HttpInput: Partial<HttpInput>;
  HttpOutgoing: Partial<HttpOutgoing>;
  HttpOutgoingInput: Partial<HttpOutgoingInput>;
  ID: Partial<Scalars['ID']['output']>;
  IncomingPayment: Partial<IncomingPayment>;
  IncomingPaymentConnection: Partial<IncomingPaymentConnection>;
  IncomingPaymentEdge: Partial<IncomingPaymentEdge>;
  IncomingPaymentResponse: Partial<IncomingPaymentResponse>;
  Int: Partial<Scalars['Int']['output']>;
  JSONObject: Partial<Scalars['JSONObject']['output']>;
  Jwk: Partial<Jwk>;
  JwkInput: Partial<JwkInput>;
  LiquidityMutationResponse: Partial<LiquidityMutationResponse>;
  Model: ResolversInterfaceTypes<ResolversParentTypes>['Model'];
  Mutation: {};
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentConnection: Partial<OutgoingPaymentConnection>;
  OutgoingPaymentEdge: Partial<OutgoingPaymentEdge>;
  OutgoingPaymentFilter: Partial<OutgoingPaymentFilter>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  Payment: Partial<Payment>;
  PaymentConnection: Partial<PaymentConnection>;
  PaymentEdge: Partial<PaymentEdge>;
  PaymentFilter: Partial<PaymentFilter>;
  Peer: Partial<Peer>;
  PeerEdge: Partial<PeerEdge>;
  PeersConnection: Partial<PeersConnection>;
  PostLiquidityWithdrawalInput: Partial<PostLiquidityWithdrawalInput>;
  Query: {};
  Quote: Partial<Quote>;
  QuoteConnection: Partial<QuoteConnection>;
  QuoteEdge: Partial<QuoteEdge>;
  QuoteResponse: Partial<QuoteResponse>;
  Receiver: Partial<Receiver>;
  RevokeWalletAddressKeyInput: Partial<RevokeWalletAddressKeyInput>;
  RevokeWalletAddressKeyMutationResponse: Partial<RevokeWalletAddressKeyMutationResponse>;
  SetFeeInput: Partial<SetFeeInput>;
  SetFeeResponse: Partial<SetFeeResponse>;
  String: Partial<Scalars['String']['output']>;
  TriggerWalletAddressEventsInput: Partial<TriggerWalletAddressEventsInput>;
  TriggerWalletAddressEventsMutationResponse: Partial<TriggerWalletAddressEventsMutationResponse>;
  UInt8: Partial<Scalars['UInt8']['output']>;
  UInt64: Partial<Scalars['UInt64']['output']>;
  UpdateAssetInput: Partial<UpdateAssetInput>;
  UpdatePeerInput: Partial<UpdatePeerInput>;
  UpdatePeerMutationResponse: Partial<UpdatePeerMutationResponse>;
  UpdateWalletAddressInput: Partial<UpdateWalletAddressInput>;
  UpdateWalletAddressMutationResponse: Partial<UpdateWalletAddressMutationResponse>;
  VoidLiquidityWithdrawalInput: Partial<VoidLiquidityWithdrawalInput>;
  WalletAddress: Partial<WalletAddress>;
  WalletAddressEdge: Partial<WalletAddressEdge>;
  WalletAddressKey: Partial<WalletAddressKey>;
  WalletAddressKeyConnection: Partial<WalletAddressKeyConnection>;
  WalletAddressKeyEdge: Partial<WalletAddressKeyEdge>;
  WalletAddressWithdrawal: Partial<WalletAddressWithdrawal>;
  WalletAddressWithdrawalMutationResponse: Partial<WalletAddressWithdrawalMutationResponse>;
  WalletAddressesConnection: Partial<WalletAddressesConnection>;
  WebhookEvent: Partial<WebhookEvent>;
  WebhookEventFilter: Partial<WebhookEventFilter>;
  WebhookEventsConnection: Partial<WebhookEventsConnection>;
  WebhookEventsEdge: Partial<WebhookEventsEdge>;
  WithdrawEventLiquidityInput: Partial<WithdrawEventLiquidityInput>;
};

export type AccountingTransferResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountingTransfer'] = ResolversParentTypes['AccountingTransfer']> = {
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  creditAccountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  debitAccountId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  ledger?: Resolver<ResolversTypes['UInt8'], ParentType, ContextType>;
  transferType?: Resolver<ResolversTypes['TransferType'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AccountingTransferConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AccountingTransferConnection'] = ResolversParentTypes['AccountingTransferConnection']> = {
  credits?: Resolver<Array<ResolversTypes['AccountingTransfer']>, ParentType, ContextType>;
  debits?: Resolver<Array<ResolversTypes['AccountingTransfer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AdditionalPropertyResolvers<ContextType = any, ParentType extends ResolversParentTypes['AdditionalProperty'] = ResolversParentTypes['AdditionalProperty']> = {
  key?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  visibleInOpenPayments?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  assetCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  assetScale?: Resolver<ResolversTypes['UInt8'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ApproveIncomingPaymentResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['ApproveIncomingPaymentResponse'] = ResolversParentTypes['ApproveIncomingPaymentResponse']> = {
  payment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fees?: Resolver<Maybe<ResolversTypes['FeesConnection']>, ParentType, ContextType, Partial<AssetFeesArgs>>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  liquidityThreshold?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  receivingFee?: Resolver<Maybe<ResolversTypes['Fee']>, ParentType, ContextType>;
  scale?: Resolver<ResolversTypes['UInt8'], ParentType, ContextType>;
  sendingFee?: Resolver<Maybe<ResolversTypes['Fee']>, ParentType, ContextType>;
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
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['AssetsConnection'] = ResolversParentTypes['AssetsConnection']> = {
  edges?: Resolver<Array<ResolversTypes['AssetEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type BasePaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['BasePayment'] = ResolversParentTypes['BasePayment']> = {
  __resolveType: TypeResolveFn<'IncomingPayment' | 'OutgoingPayment' | 'Payment', ParentType, ContextType>;
  client?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type CancelIncomingPaymentResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CancelIncomingPaymentResponse'] = ResolversParentTypes['CancelIncomingPaymentResponse']> = {
  payment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateOrUpdatePeerByUrlMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateOrUpdatePeerByUrlMutationResponse'] = ResolversParentTypes['CreateOrUpdatePeerByUrlMutationResponse']> = {
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreatePeerMutationResponse'] = ResolversParentTypes['CreatePeerMutationResponse']> = {
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateReceiverResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateReceiverResponse'] = ResolversParentTypes['CreateReceiverResponse']> = {
  receiver?: Resolver<Maybe<ResolversTypes['Receiver']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateWalletAddressKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateWalletAddressKeyMutationResponse'] = ResolversParentTypes['CreateWalletAddressKeyMutationResponse']> = {
  walletAddressKey?: Resolver<Maybe<ResolversTypes['WalletAddressKey']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreateWalletAddressMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateWalletAddressMutationResponse'] = ResolversParentTypes['CreateWalletAddressMutationResponse']> = {
  walletAddress?: Resolver<Maybe<ResolversTypes['WalletAddress']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeleteAssetMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeleteAssetMutationResponse'] = ResolversParentTypes['DeleteAssetMutationResponse']> = {
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeletePeerMutationResponse'] = ResolversParentTypes['DeletePeerMutationResponse']> = {
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FeeResolvers<ContextType = any, ParentType extends ResolversParentTypes['Fee'] = ResolversParentTypes['Fee']> = {
  assetId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  basisPoints?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fixed?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['FeeType'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FeeEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['FeeEdge'] = ResolversParentTypes['FeeEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Fee'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type FeesConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['FeesConnection'] = ResolversParentTypes['FeesConnection']> = {
  edges?: Resolver<Array<ResolversTypes['FeeEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
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
  client?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['IncomingPaymentState'], ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  payment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface JsonObjectScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['JSONObject'], any> {
  name: 'JSONObject';
}

export type JwkResolvers<ContextType = any, ParentType extends ResolversParentTypes['Jwk'] = ResolversParentTypes['Jwk']> = {
  alg?: Resolver<ResolversTypes['Alg'], ParentType, ContextType>;
  crv?: Resolver<ResolversTypes['Crv'], ParentType, ContextType>;
  kid?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  kty?: Resolver<ResolversTypes['Kty'], ParentType, ContextType>;
  x?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type LiquidityMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['LiquidityMutationResponse'] = ResolversParentTypes['LiquidityMutationResponse']> = {
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ModelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Model'] = ResolversParentTypes['Model']> = {
  __resolveType: TypeResolveFn<'AccountingTransfer' | 'Asset' | 'Fee' | 'IncomingPayment' | 'OutgoingPayment' | 'Payment' | 'Peer' | 'WalletAddress' | 'WalletAddressKey' | 'WebhookEvent', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  approveIncomingPayment?: Resolver<ResolversTypes['ApproveIncomingPaymentResponse'], ParentType, ContextType, RequireFields<MutationApproveIncomingPaymentArgs, 'input'>>;
  cancelIncomingPayment?: Resolver<ResolversTypes['CancelIncomingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCancelIncomingPaymentArgs, 'input'>>;
  cancelOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCancelOutgoingPaymentArgs, 'input'>>;
  createAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAssetArgs, 'input'>>;
  createAssetLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateAssetLiquidityWithdrawalArgs, 'input'>>;
  createIncomingPayment?: Resolver<ResolversTypes['IncomingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateIncomingPaymentArgs, 'input'>>;
  createIncomingPaymentWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateIncomingPaymentWithdrawalArgs, 'input'>>;
  createOrUpdatePeerByUrl?: Resolver<ResolversTypes['CreateOrUpdatePeerByUrlMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateOrUpdatePeerByUrlArgs, 'input'>>;
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  createOutgoingPaymentFromIncomingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentFromIncomingPaymentArgs, 'input'>>;
  createOutgoingPaymentWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentWithdrawalArgs, 'input'>>;
  createPeer?: Resolver<ResolversTypes['CreatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePeerArgs, 'input'>>;
  createPeerLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePeerLiquidityWithdrawalArgs, 'input'>>;
  createQuote?: Resolver<ResolversTypes['QuoteResponse'], ParentType, ContextType, RequireFields<MutationCreateQuoteArgs, 'input'>>;
  createReceiver?: Resolver<ResolversTypes['CreateReceiverResponse'], ParentType, ContextType, RequireFields<MutationCreateReceiverArgs, 'input'>>;
  createWalletAddress?: Resolver<ResolversTypes['CreateWalletAddressMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateWalletAddressArgs, 'input'>>;
  createWalletAddressKey?: Resolver<Maybe<ResolversTypes['CreateWalletAddressKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWalletAddressKeyArgs, 'input'>>;
  createWalletAddressWithdrawal?: Resolver<Maybe<ResolversTypes['WalletAddressWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateWalletAddressWithdrawalArgs, 'input'>>;
  deleteAsset?: Resolver<ResolversTypes['DeleteAssetMutationResponse'], ParentType, ContextType, RequireFields<MutationDeleteAssetArgs, 'input'>>;
  deletePeer?: Resolver<ResolversTypes['DeletePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationDeletePeerArgs, 'input'>>;
  depositAssetLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositAssetLiquidityArgs, 'input'>>;
  depositEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositEventLiquidityArgs, 'input'>>;
  depositOutgoingPaymentLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositOutgoingPaymentLiquidityArgs, 'input'>>;
  depositPeerLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositPeerLiquidityArgs, 'input'>>;
  postLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationPostLiquidityWithdrawalArgs, 'input'>>;
  revokeWalletAddressKey?: Resolver<Maybe<ResolversTypes['RevokeWalletAddressKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokeWalletAddressKeyArgs, 'input'>>;
  setFee?: Resolver<ResolversTypes['SetFeeResponse'], ParentType, ContextType, RequireFields<MutationSetFeeArgs, 'input'>>;
  triggerWalletAddressEvents?: Resolver<ResolversTypes['TriggerWalletAddressEventsMutationResponse'], ParentType, ContextType, RequireFields<MutationTriggerWalletAddressEventsArgs, 'input'>>;
  updateAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateAssetArgs, 'input'>>;
  updatePeer?: Resolver<ResolversTypes['UpdatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdatePeerArgs, 'input'>>;
  updateWalletAddress?: Resolver<ResolversTypes['UpdateWalletAddressMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateWalletAddressArgs, 'input'>>;
  voidLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationVoidLiquidityWithdrawalArgs, 'input'>>;
  withdrawEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationWithdrawEventLiquidityArgs, 'input'>>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  client?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  debitAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  grantId?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  sentAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['OutgoingPaymentState'], ParentType, ContextType>;
  stateAttempts?: Resolver<ResolversTypes['Int'], ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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

export type PaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['Payment'] = ResolversParentTypes['Payment']> = {
  client?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['PaymentType'], ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentConnection'] = ResolversParentTypes['PaymentConnection']> = {
  edges?: Resolver<Array<ResolversTypes['PaymentEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentEdge'] = ResolversParentTypes['PaymentEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['Payment'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Peer'] = ResolversParentTypes['Peer']> = {
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  http?: Resolver<ResolversTypes['Http'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingTokens?: Resolver<Maybe<Array<ResolversTypes['String']>>, ParentType, ContextType>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  liquidityThreshold?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  maxPacketAmount?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  name?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
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
  accountingTransfers?: Resolver<ResolversTypes['AccountingTransferConnection'], ParentType, ContextType, RequireFields<QueryAccountingTransfersArgs, 'id'>>;
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType, RequireFields<QueryAssetArgs, 'id'>>;
  assets?: Resolver<ResolversTypes['AssetsConnection'], ParentType, ContextType, Partial<QueryAssetsArgs>>;
  incomingPayment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType, RequireFields<QueryIncomingPaymentArgs, 'id'>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
  outgoingPayments?: Resolver<ResolversTypes['OutgoingPaymentConnection'], ParentType, ContextType, Partial<QueryOutgoingPaymentsArgs>>;
  payments?: Resolver<ResolversTypes['PaymentConnection'], ParentType, ContextType, Partial<QueryPaymentsArgs>>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType, RequireFields<QueryPeerArgs, 'id'>>;
  peers?: Resolver<ResolversTypes['PeersConnection'], ParentType, ContextType, Partial<QueryPeersArgs>>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType, RequireFields<QueryQuoteArgs, 'id'>>;
  receiver?: Resolver<Maybe<ResolversTypes['Receiver']>, ParentType, ContextType, RequireFields<QueryReceiverArgs, 'id'>>;
  walletAddress?: Resolver<Maybe<ResolversTypes['WalletAddress']>, ParentType, ContextType, RequireFields<QueryWalletAddressArgs, 'id'>>;
  walletAddresses?: Resolver<ResolversTypes['WalletAddressesConnection'], ParentType, ContextType, Partial<QueryWalletAddressesArgs>>;
  webhookEvents?: Resolver<ResolversTypes['WebhookEventsConnection'], ParentType, ContextType, Partial<QueryWebhookEventsArgs>>;
};

export type QuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['Quote'] = ResolversParentTypes['Quote']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  debitAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  estimatedExchangeRate?: Resolver<Maybe<ResolversTypes['Float']>, ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ReceiverResolvers<ContextType = any, ParentType extends ResolversParentTypes['Receiver'] = ResolversParentTypes['Receiver']> = {
  completed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  walletAddressUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RevokeWalletAddressKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokeWalletAddressKeyMutationResponse'] = ResolversParentTypes['RevokeWalletAddressKeyMutationResponse']> = {
  walletAddressKey?: Resolver<Maybe<ResolversTypes['WalletAddressKey']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SetFeeResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['SetFeeResponse'] = ResolversParentTypes['SetFeeResponse']> = {
  fee?: Resolver<Maybe<ResolversTypes['Fee']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type TriggerWalletAddressEventsMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['TriggerWalletAddressEventsMutationResponse'] = ResolversParentTypes['TriggerWalletAddressEventsMutationResponse']> = {
  count?: Resolver<Maybe<ResolversTypes['Int']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export interface UInt8ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt8'], any> {
  name: 'UInt8';
}

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type UpdatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdatePeerMutationResponse'] = ResolversParentTypes['UpdatePeerMutationResponse']> = {
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UpdateWalletAddressMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdateWalletAddressMutationResponse'] = ResolversParentTypes['UpdateWalletAddressMutationResponse']> = {
  walletAddress?: Resolver<Maybe<ResolversTypes['WalletAddress']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddress'] = ResolversParentTypes['WalletAddress']> = {
  additionalProperties?: Resolver<Maybe<Array<Maybe<ResolversTypes['AdditionalProperty']>>>, ParentType, ContextType>;
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingPayments?: Resolver<Maybe<ResolversTypes['IncomingPaymentConnection']>, ParentType, ContextType, Partial<WalletAddressIncomingPaymentsArgs>>;
  liquidity?: Resolver<Maybe<ResolversTypes['UInt64']>, ParentType, ContextType>;
  outgoingPayments?: Resolver<Maybe<ResolversTypes['OutgoingPaymentConnection']>, ParentType, ContextType, Partial<WalletAddressOutgoingPaymentsArgs>>;
  publicName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quotes?: Resolver<Maybe<ResolversTypes['QuoteConnection']>, ParentType, ContextType, Partial<WalletAddressQuotesArgs>>;
  status?: Resolver<ResolversTypes['WalletAddressStatus'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  walletAddressKeys?: Resolver<Maybe<ResolversTypes['WalletAddressKeyConnection']>, ParentType, ContextType, Partial<WalletAddressWalletAddressKeysArgs>>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressEdge'] = ResolversParentTypes['WalletAddressEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['WalletAddress'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressKeyResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressKey'] = ResolversParentTypes['WalletAddressKey']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  jwk?: Resolver<ResolversTypes['Jwk'], ParentType, ContextType>;
  revoked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  walletAddressId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressKeyConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressKeyConnection'] = ResolversParentTypes['WalletAddressKeyConnection']> = {
  edges?: Resolver<Array<ResolversTypes['WalletAddressKeyEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressKeyEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressKeyEdge'] = ResolversParentTypes['WalletAddressKeyEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['WalletAddressKey'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressWithdrawalResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressWithdrawal'] = ResolversParentTypes['WalletAddressWithdrawal']> = {
  amount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  walletAddress?: Resolver<ResolversTypes['WalletAddress'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressWithdrawalMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressWithdrawalMutationResponse'] = ResolversParentTypes['WalletAddressWithdrawalMutationResponse']> = {
  withdrawal?: Resolver<Maybe<ResolversTypes['WalletAddressWithdrawal']>, ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WalletAddressesConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WalletAddressesConnection'] = ResolversParentTypes['WalletAddressesConnection']> = {
  edges?: Resolver<Array<ResolversTypes['WalletAddressEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhookEventResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebhookEvent'] = ResolversParentTypes['WebhookEvent']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  data?: Resolver<ResolversTypes['JSONObject'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhookEventsConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebhookEventsConnection'] = ResolversParentTypes['WebhookEventsConnection']> = {
  edges?: Resolver<Array<ResolversTypes['WebhookEventsEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type WebhookEventsEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['WebhookEventsEdge'] = ResolversParentTypes['WebhookEventsEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['WebhookEvent'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type Resolvers<ContextType = any> = {
  AccountingTransfer?: AccountingTransferResolvers<ContextType>;
  AccountingTransferConnection?: AccountingTransferConnectionResolvers<ContextType>;
  AdditionalProperty?: AdditionalPropertyResolvers<ContextType>;
  Amount?: AmountResolvers<ContextType>;
  ApproveIncomingPaymentResponse?: ApproveIncomingPaymentResponseResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  AssetEdge?: AssetEdgeResolvers<ContextType>;
  AssetMutationResponse?: AssetMutationResponseResolvers<ContextType>;
  AssetsConnection?: AssetsConnectionResolvers<ContextType>;
  BasePayment?: BasePaymentResolvers<ContextType>;
  CancelIncomingPaymentResponse?: CancelIncomingPaymentResponseResolvers<ContextType>;
  CreateOrUpdatePeerByUrlMutationResponse?: CreateOrUpdatePeerByUrlMutationResponseResolvers<ContextType>;
  CreatePeerMutationResponse?: CreatePeerMutationResponseResolvers<ContextType>;
  CreateReceiverResponse?: CreateReceiverResponseResolvers<ContextType>;
  CreateWalletAddressKeyMutationResponse?: CreateWalletAddressKeyMutationResponseResolvers<ContextType>;
  CreateWalletAddressMutationResponse?: CreateWalletAddressMutationResponseResolvers<ContextType>;
  DeleteAssetMutationResponse?: DeleteAssetMutationResponseResolvers<ContextType>;
  DeletePeerMutationResponse?: DeletePeerMutationResponseResolvers<ContextType>;
  Fee?: FeeResolvers<ContextType>;
  FeeEdge?: FeeEdgeResolvers<ContextType>;
  FeesConnection?: FeesConnectionResolvers<ContextType>;
  Http?: HttpResolvers<ContextType>;
  HttpOutgoing?: HttpOutgoingResolvers<ContextType>;
  IncomingPayment?: IncomingPaymentResolvers<ContextType>;
  IncomingPaymentConnection?: IncomingPaymentConnectionResolvers<ContextType>;
  IncomingPaymentEdge?: IncomingPaymentEdgeResolvers<ContextType>;
  IncomingPaymentResponse?: IncomingPaymentResponseResolvers<ContextType>;
  JSONObject?: GraphQLScalarType;
  Jwk?: JwkResolvers<ContextType>;
  LiquidityMutationResponse?: LiquidityMutationResponseResolvers<ContextType>;
  Model?: ModelResolvers<ContextType>;
  Mutation?: MutationResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentConnection?: OutgoingPaymentConnectionResolvers<ContextType>;
  OutgoingPaymentEdge?: OutgoingPaymentEdgeResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Payment?: PaymentResolvers<ContextType>;
  PaymentConnection?: PaymentConnectionResolvers<ContextType>;
  PaymentEdge?: PaymentEdgeResolvers<ContextType>;
  Peer?: PeerResolvers<ContextType>;
  PeerEdge?: PeerEdgeResolvers<ContextType>;
  PeersConnection?: PeersConnectionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Quote?: QuoteResolvers<ContextType>;
  QuoteConnection?: QuoteConnectionResolvers<ContextType>;
  QuoteEdge?: QuoteEdgeResolvers<ContextType>;
  QuoteResponse?: QuoteResponseResolvers<ContextType>;
  Receiver?: ReceiverResolvers<ContextType>;
  RevokeWalletAddressKeyMutationResponse?: RevokeWalletAddressKeyMutationResponseResolvers<ContextType>;
  SetFeeResponse?: SetFeeResponseResolvers<ContextType>;
  TriggerWalletAddressEventsMutationResponse?: TriggerWalletAddressEventsMutationResponseResolvers<ContextType>;
  UInt8?: GraphQLScalarType;
  UInt64?: GraphQLScalarType;
  UpdatePeerMutationResponse?: UpdatePeerMutationResponseResolvers<ContextType>;
  UpdateWalletAddressMutationResponse?: UpdateWalletAddressMutationResponseResolvers<ContextType>;
  WalletAddress?: WalletAddressResolvers<ContextType>;
  WalletAddressEdge?: WalletAddressEdgeResolvers<ContextType>;
  WalletAddressKey?: WalletAddressKeyResolvers<ContextType>;
  WalletAddressKeyConnection?: WalletAddressKeyConnectionResolvers<ContextType>;
  WalletAddressKeyEdge?: WalletAddressKeyEdgeResolvers<ContextType>;
  WalletAddressWithdrawal?: WalletAddressWithdrawalResolvers<ContextType>;
  WalletAddressWithdrawalMutationResponse?: WalletAddressWithdrawalMutationResponseResolvers<ContextType>;
  WalletAddressesConnection?: WalletAddressesConnectionResolvers<ContextType>;
  WebhookEvent?: WebhookEventResolvers<ContextType>;
  WebhookEventsConnection?: WebhookEventsConnectionResolvers<ContextType>;
  WebhookEventsEdge?: WebhookEventsEdgeResolvers<ContextType>;
};


export type GetAssetQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetAssetQuery = { __typename?: 'Query', asset?: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null, liquidity?: bigint | null, createdAt: string, sendingFee?: { __typename?: 'Fee', basisPoints: number, fixed: bigint, createdAt: string } | null } | null };

export type GetAssetWithFeesQueryVariables = Exact<{
  id: Scalars['String']['input'];
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
}>;


export type GetAssetWithFeesQuery = { __typename?: 'Query', asset?: { __typename?: 'Asset', fees?: { __typename?: 'FeesConnection', edges: Array<{ __typename?: 'FeeEdge', cursor: string, node: { __typename?: 'Fee', assetId: string, basisPoints: number, createdAt: string, fixed: bigint, id: string, type: FeeType } }>, pageInfo: { __typename?: 'PageInfo', endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean, startCursor?: string | null } } | null } | null };

export type ListAssetsQueryVariables = Exact<{
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ListAssetsQuery = { __typename?: 'Query', assets: { __typename?: 'AssetsConnection', edges: Array<{ __typename?: 'AssetEdge', node: { __typename?: 'Asset', code: string, id: string, scale: number, withdrawalThreshold?: bigint | null, createdAt: string } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type CreateAssetMutationVariables = Exact<{
  input: CreateAssetInput;
}>;


export type CreateAssetMutation = { __typename?: 'Mutation', createAsset: { __typename?: 'AssetMutationResponse', asset?: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null, liquidity?: bigint | null, createdAt: string, sendingFee?: { __typename?: 'Fee', basisPoints: number, fixed: bigint, createdAt: string } | null } | null } };

export type UpdateAssetMutationVariables = Exact<{
  input: UpdateAssetInput;
}>;


export type UpdateAssetMutation = { __typename?: 'Mutation', updateAsset: { __typename?: 'AssetMutationResponse', asset?: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null, liquidity?: bigint | null, createdAt: string, sendingFee?: { __typename?: 'Fee', basisPoints: number, fixed: bigint, createdAt: string } | null } | null } };

export type SetFeeMutationVariables = Exact<{
  input: SetFeeInput;
}>;


export type SetFeeMutation = { __typename?: 'Mutation', setFee: { __typename?: 'SetFeeResponse', fee?: { __typename?: 'Fee', assetId: string, basisPoints: number, createdAt: string, fixed: bigint, id: string, type: FeeType } | null } };

export type DepositAssetLiquidityMutationVariables = Exact<{
  input: DepositAssetLiquidityInput;
}>;


export type DepositAssetLiquidityMutation = { __typename?: 'Mutation', depositAssetLiquidity?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type WithdrawAssetLiquidityVariables = Exact<{
  input: CreateAssetLiquidityWithdrawalInput;
}>;


export type WithdrawAssetLiquidity = { __typename?: 'Mutation', createAssetLiquidityWithdrawal?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type DeleteAssetMutationVariables = Exact<{
  input: DeleteAssetInput;
}>;


export type DeleteAssetMutation = { __typename?: 'Mutation', deleteAsset: { __typename?: 'DeleteAssetMutationResponse', asset?: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null, liquidity?: bigint | null, createdAt: string, sendingFee?: { __typename?: 'Fee', basisPoints: number, fixed: bigint, createdAt: string } | null } | null } };

export type GetIncomingPaymentVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetIncomingPayment = { __typename?: 'Query', incomingPayment?: { __typename?: 'IncomingPayment', id: string, walletAddressId: string, state: IncomingPaymentState, expiresAt: string, metadata?: any | null, createdAt: string, liquidity?: bigint | null, incomingAmount?: { __typename?: 'Amount', value: bigint, assetCode: string, assetScale: number } | null, receivedAmount: { __typename?: 'Amount', value: bigint, assetCode: string, assetScale: number } } | null };

export type GetOutgoingPaymentVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetOutgoingPayment = { __typename?: 'Query', outgoingPayment?: { __typename?: 'OutgoingPayment', id: string, createdAt: string, error?: string | null, receiver: string, walletAddressId: string, state: OutgoingPaymentState, metadata?: any | null, liquidity?: bigint | null, receiveAmount: { __typename?: 'Amount', assetCode: string, assetScale: number, value: bigint }, debitAmount: { __typename?: 'Amount', assetCode: string, assetScale: number, value: bigint }, sentAmount: { __typename?: 'Amount', assetCode: string, assetScale: number, value: bigint } } | null };

export type ListPaymentsQueryVariables = Exact<{
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  filter?: InputMaybe<PaymentFilter>;
}>;


export type ListPaymentsQuery = { __typename?: 'Query', payments: { __typename?: 'PaymentConnection', edges: Array<{ __typename?: 'PaymentEdge', node: { __typename?: 'Payment', id: string, type: PaymentType, state: string, createdAt: string } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type DepositOutgoingPaymentLiquidityVariables = Exact<{
  input: DepositOutgoingPaymentLiquidityInput;
}>;


export type DepositOutgoingPaymentLiquidity = { __typename?: 'Mutation', depositOutgoingPaymentLiquidity?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type CreateOutgoingPaymentWithdrawalVariables = Exact<{
  input: CreateOutgoingPaymentWithdrawalInput;
}>;


export type CreateOutgoingPaymentWithdrawal = { __typename?: 'Mutation', createOutgoingPaymentWithdrawal?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type CreateIncomingPaymentWithdrawalVariables = Exact<{
  input: CreateIncomingPaymentWithdrawalInput;
}>;


export type CreateIncomingPaymentWithdrawal = { __typename?: 'Mutation', createIncomingPaymentWithdrawal?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type GetPeerQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetPeerQuery = { __typename?: 'Query', peer?: { __typename?: 'Peer', id: string, name?: string | null, staticIlpAddress: string, maxPacketAmount?: bigint | null, liquidity?: bigint | null, createdAt: string, incomingTokens?: Array<string> | null, asset: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null }, http: { __typename?: 'Http', outgoing: { __typename?: 'HttpOutgoing', endpoint: string, authToken: string } } } | null };

export type ListPeersQueryVariables = Exact<{
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ListPeersQuery = { __typename?: 'Query', peers: { __typename?: 'PeersConnection', edges: Array<{ __typename?: 'PeerEdge', node: { __typename?: 'Peer', id: string, name?: string | null, staticIlpAddress: string, http: { __typename?: 'Http', outgoing: { __typename?: 'HttpOutgoing', endpoint: string } }, asset: { __typename?: 'Asset', code: string, scale: number } } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type CreatePeerMutationVariables = Exact<{
  input: CreatePeerInput;
}>;


export type CreatePeerMutation = { __typename?: 'Mutation', createPeer: { __typename?: 'CreatePeerMutationResponse', peer?: { __typename?: 'Peer', id: string } | null } };

export type UpdatePeerMutationVariables = Exact<{
  input: UpdatePeerInput;
}>;


export type UpdatePeerMutation = { __typename?: 'Mutation', updatePeer: { __typename?: 'UpdatePeerMutationResponse', peer?: { __typename?: 'Peer', id: string } | null } };

export type DeletePeerMutationVariables = Exact<{
  input: DeletePeerInput;
}>;


export type DeletePeerMutation = { __typename?: 'Mutation', deletePeer: { __typename?: 'DeletePeerMutationResponse', success: boolean } };

export type DepositPeerLiquidityMutationVariables = Exact<{
  input: DepositPeerLiquidityInput;
}>;


export type DepositPeerLiquidityMutation = { __typename?: 'Mutation', depositPeerLiquidity?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type WithdrawPeerLiquidityVariables = Exact<{
  input: CreatePeerLiquidityWithdrawalInput;
}>;


export type WithdrawPeerLiquidity = { __typename?: 'Mutation', createPeerLiquidityWithdrawal?: { __typename?: 'LiquidityMutationResponse', success: boolean } | null };

export type GetWalletAddressQueryVariables = Exact<{
  id: Scalars['String']['input'];
}>;


export type GetWalletAddressQuery = { __typename?: 'Query', walletAddress?: { __typename?: 'WalletAddress', id: string, url: string, publicName?: string | null, status: WalletAddressStatus, createdAt: string, liquidity?: bigint | null, asset: { __typename?: 'Asset', id: string, code: string, scale: number, withdrawalThreshold?: bigint | null } } | null };

export type ListWalletAddresssQueryVariables = Exact<{
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
}>;


export type ListWalletAddresssQuery = { __typename?: 'Query', walletAddresses: { __typename?: 'WalletAddressesConnection', edges: Array<{ __typename?: 'WalletAddressEdge', cursor: string, node: { __typename?: 'WalletAddress', id: string, publicName?: string | null, status: WalletAddressStatus, url: string } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };

export type UpdateWalletAddressMutationVariables = Exact<{
  input: UpdateWalletAddressInput;
}>;


export type UpdateWalletAddressMutation = { __typename?: 'Mutation', updateWalletAddress: { __typename?: 'UpdateWalletAddressMutationResponse', walletAddress?: { __typename?: 'WalletAddress', id: string } | null } };

export type CreateWalletAddressMutationVariables = Exact<{
  input: CreateWalletAddressInput;
}>;


export type CreateWalletAddressMutation = { __typename?: 'Mutation', createWalletAddress: { __typename?: 'CreateWalletAddressMutationResponse', walletAddress?: { __typename?: 'WalletAddress', id: string } | null } };

export type CreateWalletAddressWithdrawalVariables = Exact<{
  input: CreateWalletAddressWithdrawalInput;
}>;


export type CreateWalletAddressWithdrawal = { __typename?: 'Mutation', createWalletAddressWithdrawal?: { __typename?: 'WalletAddressWithdrawalMutationResponse', withdrawal?: { __typename?: 'WalletAddressWithdrawal', id: string } | null } | null };

export type ListWebhookEventsVariables = Exact<{
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
  filter?: InputMaybe<WebhookEventFilter>;
}>;


export type ListWebhookEvents = { __typename?: 'Query', webhookEvents: { __typename?: 'WebhookEventsConnection', edges: Array<{ __typename?: 'WebhookEventsEdge', cursor: string, node: { __typename?: 'WebhookEvent', id: string, data: any, type: string, createdAt: string } }>, pageInfo: { __typename?: 'PageInfo', startCursor?: string | null, endCursor?: string | null, hasNextPage: boolean, hasPreviousPage: boolean } } };
