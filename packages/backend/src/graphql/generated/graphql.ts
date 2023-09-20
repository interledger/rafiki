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

export type AddAssetLiquidityInput = {
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64']['input'];
  /** The id of the asset to add liquidity. */
  assetId: Scalars['String']['input'];
  /** The id of the transfer. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
};

export type AddPeerLiquidityInput = {
  /** Amount of liquidity to add. */
  amount: Scalars['UInt64']['input'];
  /** The id of the transfer. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the peer to add liquidity. */
  peerId: Scalars['String']['input'];
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

export type Asset = Model & {
  __typename?: 'Asset';
  /** [ISO 4217 currency code](https://en.wikipedia.org/wiki/ISO_4217), e.g. `USD` */
  code: Scalars['String']['output'];
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
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

export type AssetEdge = {
  __typename?: 'AssetEdge';
  cursor: Scalars['String']['output'];
  node: Asset;
};

export type AssetMutationResponse = MutationResponse & {
  __typename?: 'AssetMutationResponse';
  asset?: Maybe<Asset>;
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type AssetsConnection = {
  __typename?: 'AssetsConnection';
  edges: Array<AssetEdge>;
  pageInfo: PageInfo;
};

export type BasePayment = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  paymentPointerId: Scalars['ID']['output'];
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
  /** Id of the payment pointer under which the incoming payment will be created */
  paymentPointerId: Scalars['String']['input'];
};

export type CreateOrUpdatePeerByUrlInput = {
  /** Initial amount of liquidity to add for peer */
  addedLiquidity?: InputMaybe<Scalars['UInt64']['input']>;
  /** Asset id of peering relationship */
  assetId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Account Servicing Entity will be notified via a webhook event if peer liquidity falls below this value */
  liquidityThreshold?: InputMaybe<Scalars['UInt64']['input']>;
  /** Maximum packet amount that the peer accepts */
  maxPacketAmount?: InputMaybe<Scalars['UInt64']['input']>;
  /** Peer's internal name for overriding auto-peer's default naming */
  name?: InputMaybe<Scalars['String']['input']>;
  /** Peer's URL address at which the peer accepts auto-peering requests */
  peerUrl: Scalars['String']['input'];
};

export type CreateOrUpdatePeerByUrlMutationResponse = MutationResponse & {
  __typename?: 'CreateOrUpdatePeerByUrlMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  peer?: Maybe<Peer>;
  success: Scalars['Boolean']['output'];
};

export type CreateOutgoingPaymentInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Additional metadata associated with the outgoing payment. */
  metadata?: InputMaybe<Scalars['JSONObject']['input']>;
  /** Id of the payment pointer under which the outgoing payment will be created */
  paymentPointerId: Scalars['String']['input'];
  /** Id of the corresponding quote for that outgoing payment */
  quoteId: Scalars['String']['input'];
};

export type CreatePaymentPointerInput = {
  /** Asset of the payment pointer */
  assetId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Public name associated with the payment pointer */
  publicName?: InputMaybe<Scalars['String']['input']>;
  /** Payment Pointer URL */
  url: Scalars['String']['input'];
};

export type CreatePaymentPointerKeyInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Public key */
  jwk: JwkInput;
  paymentPointerId: Scalars['String']['input'];
};

export type CreatePaymentPointerKeyMutationResponse = MutationResponse & {
  __typename?: 'CreatePaymentPointerKeyMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  paymentPointerKey?: Maybe<PaymentPointerKey>;
  success: Scalars['Boolean']['output'];
};

export type CreatePaymentPointerMutationResponse = MutationResponse & {
  __typename?: 'CreatePaymentPointerMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  paymentPointer?: Maybe<PaymentPointer>;
  success: Scalars['Boolean']['output'];
};

export type CreatePaymentPointerWithdrawalInput = {
  /** The id of the withdrawal. */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the Open Payments payment pointer to create the withdrawal for. */
  paymentPointerId: Scalars['String']['input'];
};

export type CreatePeerInput = {
  /** Asset id of peering relationship */
  assetId: Scalars['String']['input'];
  /** Peering connection details */
  http: HttpInput;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Initial amount of liquidity to add for peer */
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
};

export type CreatePeerMutationResponse = MutationResponse & {
  __typename?: 'CreatePeerMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  peer?: Maybe<Peer>;
  success: Scalars['Boolean']['output'];
};

export type CreateQuoteInput = {
  /** Amount to send (fixed send) */
  debitAmount?: InputMaybe<AmountInput>;
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Id of the payment pointer under which the quote will be created */
  paymentPointerId: Scalars['String']['input'];
  /** Amount to receive (fixed receive) */
  receiveAmount?: InputMaybe<AmountInput>;
  /** Payment pointer URL of the receiver */
  receiver: Scalars['String']['input'];
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
  /** Receiving payment pointer URL */
  paymentPointerUrl: Scalars['String']['input'];
};

export type CreateReceiverResponse = {
  __typename?: 'CreateReceiverResponse';
  code: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  receiver?: Maybe<Receiver>;
  success: Scalars['Boolean']['output'];
};

export enum Crv {
  Ed25519 = 'Ed25519'
}

export type DeletePeerInput = {
  id: Scalars['ID']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};

export type DeletePeerMutationResponse = MutationResponse & {
  __typename?: 'DeletePeerMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type DepositEventLiquidityInput = {
  /** The id of the event to deposit into. */
  eventId: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
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

export enum FeeType {
  /** Receiver pays the fees */
  Receiving = 'RECEIVING',
  /** Sender pays the fees */
  Sending = 'SENDING'
}

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
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Date-time of expiry. After this time, the incoming payment will not accept further payments made to it. */
  expiresAt: Scalars['String']['output'];
  /** Incoming Payment id */
  id: Scalars['ID']['output'];
  /** The maximum amount that should be paid into the payment pointer under this incoming payment. */
  incomingAmount?: Maybe<Amount>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Id of the payment pointer under which this incoming payment was created */
  paymentPointerId: Scalars['ID']['output'];
  /** The total amount that has been paid into the payment pointer under this incoming payment. */
  receivedAmount: Amount;
  /** Incoming payment state */
  state: IncomingPaymentState;
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
  code: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  payment?: Maybe<IncomingPayment>;
  success: Scalars['Boolean']['output'];
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
  UnknownPaymentPointer = 'UnknownPaymentPointer',
  UnknownPeer = 'UnknownPeer',
  UnknownTransfer = 'UnknownTransfer'
}

export type LiquidityMutationResponse = MutationResponse & {
  __typename?: 'LiquidityMutationResponse';
  code: Scalars['String']['output'];
  error?: Maybe<LiquidityError>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type Model = {
  createdAt: Scalars['String']['output'];
  id: Scalars['ID']['output'];
};

export type Mutation = {
  __typename?: 'Mutation';
  /** Add asset liquidity */
  addAssetLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Add peer liquidity */
  addPeerLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Create an asset */
  createAsset: AssetMutationResponse;
  /** Withdraw asset liquidity */
  createAssetLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create an internal Open Payments Incoming Payment. The receiver has a payment pointer on this Rafiki instance. */
  createIncomingPayment: IncomingPaymentResponse;
  /** Create a peer using a URL */
  createOrUpdatePeerByUrl: CreateOrUpdatePeerByUrlMutationResponse;
  /** Create an Open Payments Outgoing Payment */
  createOutgoingPayment: OutgoingPaymentResponse;
  /** Create a payment pointer */
  createPaymentPointer: CreatePaymentPointerMutationResponse;
  /** Add a public key to a payment pointer that is used to verify Open Payments requests. */
  createPaymentPointerKey?: Maybe<CreatePaymentPointerKeyMutationResponse>;
  /** Withdraw liquidity from a payment pointer received via Web Monetization. */
  createPaymentPointerWithdrawal?: Maybe<PaymentPointerWithdrawalMutationResponse>;
  /** Create a peer */
  createPeer: CreatePeerMutationResponse;
  /** Withdraw peer liquidity */
  createPeerLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Create an Open Payments Quote */
  createQuote: QuoteResponse;
  /** Create an internal or external Open Payments Incoming Payment. The receiver has a payment pointer on either this or another Open Payments resource server. */
  createReceiver: CreateReceiverResponse;
  /** Delete a peer */
  deletePeer: DeletePeerMutationResponse;
  /** Deposit webhook event liquidity */
  depositEventLiquidity?: Maybe<LiquidityMutationResponse>;
  /** Post liquidity withdrawal. Withdrawals are two-phase commits and are committed via this mutation. */
  postLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Revoke a public key associated with a payment pointer. Open Payment requests using this key for request signatures will be denied going forward. */
  revokePaymentPointerKey?: Maybe<RevokePaymentPointerKeyMutationResponse>;
  /** Set the fee on an asset */
  setFee: SetFeeResponse;
  /** If automatic withdrawal of funds received via Web Monetization by the payment pointer are disabled, this mutation can be used to trigger up to n withdrawal events. */
  triggerPaymentPointerEvents: TriggerPaymentPointerEventsMutationResponse;
  /** Update an asset */
  updateAsset: AssetMutationResponse;
  /** Update a payment pointer */
  updatePaymentPointer: UpdatePaymentPointerMutationResponse;
  /** Update a peer */
  updatePeer: UpdatePeerMutationResponse;
  /** Void liquidity withdrawal. Withdrawals are two-phase commits and are rolled back via this mutation. */
  voidLiquidityWithdrawal?: Maybe<LiquidityMutationResponse>;
  /** Withdraw webhook event liquidity */
  withdrawEventLiquidity?: Maybe<LiquidityMutationResponse>;
};


export type MutationAddAssetLiquidityArgs = {
  input: AddAssetLiquidityInput;
};


export type MutationAddPeerLiquidityArgs = {
  input: AddPeerLiquidityInput;
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


export type MutationCreateOrUpdatePeerByUrlArgs = {
  input: CreateOrUpdatePeerByUrlInput;
};


export type MutationCreateOutgoingPaymentArgs = {
  input: CreateOutgoingPaymentInput;
};


export type MutationCreatePaymentPointerArgs = {
  input: CreatePaymentPointerInput;
};


export type MutationCreatePaymentPointerKeyArgs = {
  input: CreatePaymentPointerKeyInput;
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


export type MutationCreateReceiverArgs = {
  input: CreateReceiverInput;
};


export type MutationDeletePeerArgs = {
  input: DeletePeerInput;
};


export type MutationDepositEventLiquidityArgs = {
  input: DepositEventLiquidityInput;
};


export type MutationPostLiquidityWithdrawalArgs = {
  input: PostLiquidityWithdrawalInput;
};


export type MutationRevokePaymentPointerKeyArgs = {
  input: RevokePaymentPointerKeyInput;
};


export type MutationSetFeeArgs = {
  input: SetFeeInput;
};


export type MutationTriggerPaymentPointerEventsArgs = {
  input: TriggerPaymentPointerEventsInput;
};


export type MutationUpdateAssetArgs = {
  input: UpdateAssetInput;
};


export type MutationUpdatePaymentPointerArgs = {
  input: UpdatePaymentPointerInput;
};


export type MutationUpdatePeerArgs = {
  input: UpdatePeerInput;
};


export type MutationVoidLiquidityWithdrawalArgs = {
  input: VoidLiquidityWithdrawalInput;
};


export type MutationWithdrawEventLiquidityArgs = {
  input: WithdrawEventLiquidityInput;
};

export type MutationResponse = {
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type OutgoingPayment = BasePayment & Model & {
  __typename?: 'OutgoingPayment';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Amount to send (fixed send) */
  debitAmount: Amount;
  error?: Maybe<Scalars['String']['output']>;
  /** Outgoing payment id */
  id: Scalars['ID']['output'];
  /** Additional metadata associated with the outgoing payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Id of the payment pointer under which this outgoing payment was created */
  paymentPointerId: Scalars['ID']['output'];
  /** Quote for this outgoing payment */
  quote?: Maybe<Quote>;
  /** Amount to receive (fixed receive) */
  receiveAmount: Amount;
  /** Payment pointer URL of the receiver */
  receiver: Scalars['String']['output'];
  /** Amount already sent */
  sentAmount: Amount;
  /** Outgoing payment state */
  state: OutgoingPaymentState;
  stateAttempts: Scalars['Int']['output'];
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

export type OutgoingPaymentResponse = {
  __typename?: 'OutgoingPaymentResponse';
  code: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  payment?: Maybe<OutgoingPayment>;
  success: Scalars['Boolean']['output'];
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
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Payment id */
  id: Scalars['ID']['output'];
  /** Additional metadata associated with the payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Id of the payment pointer under which this payment was created */
  paymentPointerId: Scalars['ID']['output'];
  /** Either the IncomingPaymentState or OutgoingPaymentState according to type */
  state: Scalars['String']['output'];
  /** Type of payment */
  type: PaymentType;
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
  paymentPointerId?: InputMaybe<FilterString>;
  type?: InputMaybe<FilterString>;
};

export type PaymentPointer = Model & {
  __typename?: 'PaymentPointer';
  /** Asset of the payment pointer */
  asset: Asset;
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Payment pointer id */
  id: Scalars['ID']['output'];
  /** List of incoming payments received by this payment pointer */
  incomingPayments?: Maybe<IncomingPaymentConnection>;
  /** List of outgoing payments sent from this payment pointer */
  outgoingPayments?: Maybe<OutgoingPaymentConnection>;
  /** Public name associated with the payment pointer */
  publicName?: Maybe<Scalars['String']['output']>;
  /** List of quotes created at this payment pointer */
  quotes?: Maybe<QuoteConnection>;
  /** Status of the payment pointer */
  status: PaymentPointerStatus;
  /** Payment Pointer URL */
  url: Scalars['String']['output'];
};


export type PaymentPointerIncomingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type PaymentPointerOutgoingPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type PaymentPointerQuotesArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type PaymentPointerEdge = {
  __typename?: 'PaymentPointerEdge';
  cursor: Scalars['String']['output'];
  node: PaymentPointer;
};

export type PaymentPointerKey = Model & {
  __typename?: 'PaymentPointerKey';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Internal id of key */
  id: Scalars['ID']['output'];
  /** Public key */
  jwk: Jwk;
  /** Id of the payment pointer to which this key belongs to */
  paymentPointerId: Scalars['ID']['output'];
  /** Indicator whether the key has been revoked */
  revoked: Scalars['Boolean']['output'];
};

export enum PaymentPointerStatus {
  /** Default status */
  Active = 'ACTIVE',
  /** Status after deactivating */
  Inactive = 'INACTIVE'
}

export type PaymentPointerWithdrawal = {
  __typename?: 'PaymentPointerWithdrawal';
  /** Amount to withdraw */
  amount: Scalars['UInt64']['output'];
  /** Withdrawal Id */
  id: Scalars['ID']['output'];
  /** Payment pointer details */
  paymentPointer: PaymentPointer;
};

export type PaymentPointerWithdrawalMutationResponse = MutationResponse & {
  __typename?: 'PaymentPointerWithdrawalMutationResponse';
  code: Scalars['String']['output'];
  error?: Maybe<LiquidityError>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
  withdrawal?: Maybe<PaymentPointerWithdrawal>;
};

export type PaymentPointersConnection = {
  __typename?: 'PaymentPointersConnection';
  edges: Array<PaymentPointerEdge>;
  pageInfo: PageInfo;
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
  /** Fetch an asset */
  asset?: Maybe<Asset>;
  /** Fetch a page of assets. */
  assets: AssetsConnection;
  /** Fetch an Open Payments incoming payment */
  incomingPayment?: Maybe<IncomingPayment>;
  /** Fetch an Open Payments outgoing payment */
  outgoingPayment?: Maybe<OutgoingPayment>;
  /** Fetch a payment pointer */
  paymentPointer?: Maybe<PaymentPointer>;
  /** Fetch a page of payment pointers. */
  paymentPointers: PaymentPointersConnection;
  /** Fetch a page of combined payments */
  payments: PaymentConnection;
  /** Fetch a peer */
  peer?: Maybe<Peer>;
  /** Fetch a page of peers. */
  peers: PeersConnection;
  /** Fetch an Open Payments quote */
  quote?: Maybe<Quote>;
  /** Fetch a page of webhook events */
  webhookEvents: WebhookEventsConnection;
};


export type QueryAssetArgs = {
  id: Scalars['String']['input'];
};


export type QueryAssetsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryIncomingPaymentArgs = {
  id: Scalars['String']['input'];
};


export type QueryOutgoingPaymentArgs = {
  id: Scalars['String']['input'];
};


export type QueryPaymentPointerArgs = {
  id: Scalars['String']['input'];
};


export type QueryPaymentPointersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPaymentsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<PaymentFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryPeerArgs = {
  id: Scalars['String']['input'];
};


export type QueryPeersArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};


export type QueryQuoteArgs = {
  id: Scalars['String']['input'];
};


export type QueryWebhookEventsArgs = {
  after?: InputMaybe<Scalars['String']['input']>;
  before?: InputMaybe<Scalars['String']['input']>;
  filter?: InputMaybe<WebhookEventFilter>;
  first?: InputMaybe<Scalars['Int']['input']>;
  last?: InputMaybe<Scalars['Int']['input']>;
};

export type Quote = {
  __typename?: 'Quote';
  /** Date-time of creation */
  createdAt: Scalars['String']['output'];
  /** Amount to send (fixed send) */
  debitAmount: Amount;
  /** Date-time of expiration */
  expiresAt: Scalars['String']['output'];
  /** Upper bound of probed exchange rate */
  highEstimatedExchangeRate: Scalars['Float']['output'];
  /** Quote id */
  id: Scalars['ID']['output'];
  /** Lower bound of probed exchange rate */
  lowEstimatedExchangeRate: Scalars['Float']['output'];
  /** Maximum value per packet allowed on the possible routes */
  maxPacketAmount: Scalars['UInt64']['output'];
  /** Aggregate exchange rate the payment is guaranteed to meet */
  minExchangeRate: Scalars['Float']['output'];
  /** Id of the payment pointer under which this quote was created */
  paymentPointerId: Scalars['ID']['output'];
  /** Amount to receive (fixed receive) */
  receiveAmount: Amount;
  /** Payment pointer URL of the receiver */
  receiver: Scalars['String']['output'];
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
  code: Scalars['String']['output'];
  message?: Maybe<Scalars['String']['output']>;
  quote?: Maybe<Quote>;
  success: Scalars['Boolean']['output'];
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
  /** The maximum amount that should be paid into the payment pointer under this incoming payment. */
  incomingAmount?: Maybe<Amount>;
  /** Additional metadata associated with the incoming payment. */
  metadata?: Maybe<Scalars['JSONObject']['output']>;
  /** Payment pointer URL under which the incoming payment was created */
  paymentPointerUrl: Scalars['String']['output'];
  /** The total amount that has been paid into the payment pointer under this incoming payment. */
  receivedAmount: Amount;
  /** Date-time of last update */
  updatedAt: Scalars['String']['output'];
};

export type RevokePaymentPointerKeyInput = {
  /** Internal id of key */
  id: Scalars['String']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
};

export type RevokePaymentPointerKeyMutationResponse = MutationResponse & {
  __typename?: 'RevokePaymentPointerKeyMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  paymentPointerKey?: Maybe<PaymentPointerKey>;
  success: Scalars['Boolean']['output'];
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

export type SetFeeResponse = MutationResponse & {
  __typename?: 'SetFeeResponse';
  code: Scalars['String']['output'];
  fee?: Maybe<Fee>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type TransferMutationResponse = MutationResponse & {
  __typename?: 'TransferMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
};

export type TriggerPaymentPointerEventsInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** Maximum number of events being triggered (n). */
  limit: Scalars['Int']['input'];
};

export type TriggerPaymentPointerEventsMutationResponse = MutationResponse & {
  __typename?: 'TriggerPaymentPointerEventsMutationResponse';
  code: Scalars['String']['output'];
  /** Number of events triggered */
  count?: Maybe<Scalars['Int']['output']>;
  message: Scalars['String']['output'];
  success: Scalars['Boolean']['output'];
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

export type UpdatePaymentPointerInput = {
  /** ID of payment pointer to update */
  id: Scalars['ID']['input'];
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey?: InputMaybe<Scalars['String']['input']>;
  /** New public name for payment pointer */
  publicName?: InputMaybe<Scalars['String']['input']>;
  /** New status to set the payment pointer to */
  status?: InputMaybe<PaymentPointerStatus>;
};

export type UpdatePaymentPointerMutationResponse = MutationResponse & {
  __typename?: 'UpdatePaymentPointerMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  paymentPointer?: Maybe<PaymentPointer>;
  success: Scalars['Boolean']['output'];
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

export type UpdatePeerMutationResponse = MutationResponse & {
  __typename?: 'UpdatePeerMutationResponse';
  code: Scalars['String']['output'];
  message: Scalars['String']['output'];
  peer?: Maybe<Peer>;
  success: Scalars['Boolean']['output'];
};

export type VoidLiquidityWithdrawalInput = {
  /** Unique key to ensure duplicate or retried requests are processed only once. See [idempotence](https://en.wikipedia.org/wiki/Idempotence) */
  idempotencyKey: Scalars['String']['input'];
  /** The id of the liquidity withdrawal to void. */
  withdrawalId: Scalars['String']['input'];
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
  Model: ( Partial<Asset> ) | ( Partial<Fee> ) | ( Partial<IncomingPayment> ) | ( Partial<OutgoingPayment> ) | ( Partial<Payment> ) | ( Partial<PaymentPointer> ) | ( Partial<PaymentPointerKey> ) | ( Partial<Peer> ) | ( Partial<WebhookEvent> );
  MutationResponse: ( Partial<AssetMutationResponse> ) | ( Partial<CreateOrUpdatePeerByUrlMutationResponse> ) | ( Partial<CreatePaymentPointerKeyMutationResponse> ) | ( Partial<CreatePaymentPointerMutationResponse> ) | ( Partial<CreatePeerMutationResponse> ) | ( Partial<DeletePeerMutationResponse> ) | ( Partial<LiquidityMutationResponse> ) | ( Partial<PaymentPointerWithdrawalMutationResponse> ) | ( Partial<RevokePaymentPointerKeyMutationResponse> ) | ( Partial<SetFeeResponse> ) | ( Partial<TransferMutationResponse> ) | ( Partial<TriggerPaymentPointerEventsMutationResponse> ) | ( Partial<UpdatePaymentPointerMutationResponse> ) | ( Partial<UpdatePeerMutationResponse> );
};

/** Mapping between all available schema types and the resolvers types */
export type ResolversTypes = {
  AddAssetLiquidityInput: ResolverTypeWrapper<Partial<AddAssetLiquidityInput>>;
  AddPeerLiquidityInput: ResolverTypeWrapper<Partial<AddPeerLiquidityInput>>;
  Alg: ResolverTypeWrapper<Partial<Alg>>;
  Amount: ResolverTypeWrapper<Partial<Amount>>;
  AmountInput: ResolverTypeWrapper<Partial<AmountInput>>;
  Asset: ResolverTypeWrapper<Partial<Asset>>;
  AssetEdge: ResolverTypeWrapper<Partial<AssetEdge>>;
  AssetMutationResponse: ResolverTypeWrapper<Partial<AssetMutationResponse>>;
  AssetsConnection: ResolverTypeWrapper<Partial<AssetsConnection>>;
  BasePayment: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['BasePayment']>;
  Boolean: ResolverTypeWrapper<Partial<Scalars['Boolean']['output']>>;
  CreateAssetInput: ResolverTypeWrapper<Partial<CreateAssetInput>>;
  CreateAssetLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreateAssetLiquidityWithdrawalInput>>;
  CreateIncomingPaymentInput: ResolverTypeWrapper<Partial<CreateIncomingPaymentInput>>;
  CreateOrUpdatePeerByUrlInput: ResolverTypeWrapper<Partial<CreateOrUpdatePeerByUrlInput>>;
  CreateOrUpdatePeerByUrlMutationResponse: ResolverTypeWrapper<Partial<CreateOrUpdatePeerByUrlMutationResponse>>;
  CreateOutgoingPaymentInput: ResolverTypeWrapper<Partial<CreateOutgoingPaymentInput>>;
  CreatePaymentPointerInput: ResolverTypeWrapper<Partial<CreatePaymentPointerInput>>;
  CreatePaymentPointerKeyInput: ResolverTypeWrapper<Partial<CreatePaymentPointerKeyInput>>;
  CreatePaymentPointerKeyMutationResponse: ResolverTypeWrapper<Partial<CreatePaymentPointerKeyMutationResponse>>;
  CreatePaymentPointerMutationResponse: ResolverTypeWrapper<Partial<CreatePaymentPointerMutationResponse>>;
  CreatePaymentPointerWithdrawalInput: ResolverTypeWrapper<Partial<CreatePaymentPointerWithdrawalInput>>;
  CreatePeerInput: ResolverTypeWrapper<Partial<CreatePeerInput>>;
  CreatePeerLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<CreatePeerLiquidityWithdrawalInput>>;
  CreatePeerMutationResponse: ResolverTypeWrapper<Partial<CreatePeerMutationResponse>>;
  CreateQuoteInput: ResolverTypeWrapper<Partial<CreateQuoteInput>>;
  CreateReceiverInput: ResolverTypeWrapper<Partial<CreateReceiverInput>>;
  CreateReceiverResponse: ResolverTypeWrapper<Partial<CreateReceiverResponse>>;
  Crv: ResolverTypeWrapper<Partial<Crv>>;
  DeletePeerInput: ResolverTypeWrapper<Partial<DeletePeerInput>>;
  DeletePeerMutationResponse: ResolverTypeWrapper<Partial<DeletePeerMutationResponse>>;
  DepositEventLiquidityInput: ResolverTypeWrapper<Partial<DepositEventLiquidityInput>>;
  Fee: ResolverTypeWrapper<Partial<Fee>>;
  FeeDetails: ResolverTypeWrapper<Partial<FeeDetails>>;
  FeeType: ResolverTypeWrapper<Partial<FeeType>>;
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
  MutationResponse: ResolverTypeWrapper<ResolversInterfaceTypes<ResolversTypes>['MutationResponse']>;
  OutgoingPayment: ResolverTypeWrapper<Partial<OutgoingPayment>>;
  OutgoingPaymentConnection: ResolverTypeWrapper<Partial<OutgoingPaymentConnection>>;
  OutgoingPaymentEdge: ResolverTypeWrapper<Partial<OutgoingPaymentEdge>>;
  OutgoingPaymentResponse: ResolverTypeWrapper<Partial<OutgoingPaymentResponse>>;
  OutgoingPaymentState: ResolverTypeWrapper<Partial<OutgoingPaymentState>>;
  PageInfo: ResolverTypeWrapper<Partial<PageInfo>>;
  Payment: ResolverTypeWrapper<Partial<Payment>>;
  PaymentConnection: ResolverTypeWrapper<Partial<PaymentConnection>>;
  PaymentEdge: ResolverTypeWrapper<Partial<PaymentEdge>>;
  PaymentFilter: ResolverTypeWrapper<Partial<PaymentFilter>>;
  PaymentPointer: ResolverTypeWrapper<Partial<PaymentPointer>>;
  PaymentPointerEdge: ResolverTypeWrapper<Partial<PaymentPointerEdge>>;
  PaymentPointerKey: ResolverTypeWrapper<Partial<PaymentPointerKey>>;
  PaymentPointerStatus: ResolverTypeWrapper<Partial<PaymentPointerStatus>>;
  PaymentPointerWithdrawal: ResolverTypeWrapper<Partial<PaymentPointerWithdrawal>>;
  PaymentPointerWithdrawalMutationResponse: ResolverTypeWrapper<Partial<PaymentPointerWithdrawalMutationResponse>>;
  PaymentPointersConnection: ResolverTypeWrapper<Partial<PaymentPointersConnection>>;
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
  RevokePaymentPointerKeyInput: ResolverTypeWrapper<Partial<RevokePaymentPointerKeyInput>>;
  RevokePaymentPointerKeyMutationResponse: ResolverTypeWrapper<Partial<RevokePaymentPointerKeyMutationResponse>>;
  SetFeeInput: ResolverTypeWrapper<Partial<SetFeeInput>>;
  SetFeeResponse: ResolverTypeWrapper<Partial<SetFeeResponse>>;
  String: ResolverTypeWrapper<Partial<Scalars['String']['output']>>;
  TransferMutationResponse: ResolverTypeWrapper<Partial<TransferMutationResponse>>;
  TriggerPaymentPointerEventsInput: ResolverTypeWrapper<Partial<TriggerPaymentPointerEventsInput>>;
  TriggerPaymentPointerEventsMutationResponse: ResolverTypeWrapper<Partial<TriggerPaymentPointerEventsMutationResponse>>;
  UInt8: ResolverTypeWrapper<Partial<Scalars['UInt8']['output']>>;
  UInt64: ResolverTypeWrapper<Partial<Scalars['UInt64']['output']>>;
  UpdateAssetInput: ResolverTypeWrapper<Partial<UpdateAssetInput>>;
  UpdatePaymentPointerInput: ResolverTypeWrapper<Partial<UpdatePaymentPointerInput>>;
  UpdatePaymentPointerMutationResponse: ResolverTypeWrapper<Partial<UpdatePaymentPointerMutationResponse>>;
  UpdatePeerInput: ResolverTypeWrapper<Partial<UpdatePeerInput>>;
  UpdatePeerMutationResponse: ResolverTypeWrapper<Partial<UpdatePeerMutationResponse>>;
  VoidLiquidityWithdrawalInput: ResolverTypeWrapper<Partial<VoidLiquidityWithdrawalInput>>;
  WebhookEvent: ResolverTypeWrapper<Partial<WebhookEvent>>;
  WebhookEventFilter: ResolverTypeWrapper<Partial<WebhookEventFilter>>;
  WebhookEventsConnection: ResolverTypeWrapper<Partial<WebhookEventsConnection>>;
  WebhookEventsEdge: ResolverTypeWrapper<Partial<WebhookEventsEdge>>;
  WithdrawEventLiquidityInput: ResolverTypeWrapper<Partial<WithdrawEventLiquidityInput>>;
};

/** Mapping between all available schema types and the resolvers parents */
export type ResolversParentTypes = {
  AddAssetLiquidityInput: Partial<AddAssetLiquidityInput>;
  AddPeerLiquidityInput: Partial<AddPeerLiquidityInput>;
  Amount: Partial<Amount>;
  AmountInput: Partial<AmountInput>;
  Asset: Partial<Asset>;
  AssetEdge: Partial<AssetEdge>;
  AssetMutationResponse: Partial<AssetMutationResponse>;
  AssetsConnection: Partial<AssetsConnection>;
  BasePayment: ResolversInterfaceTypes<ResolversParentTypes>['BasePayment'];
  Boolean: Partial<Scalars['Boolean']['output']>;
  CreateAssetInput: Partial<CreateAssetInput>;
  CreateAssetLiquidityWithdrawalInput: Partial<CreateAssetLiquidityWithdrawalInput>;
  CreateIncomingPaymentInput: Partial<CreateIncomingPaymentInput>;
  CreateOrUpdatePeerByUrlInput: Partial<CreateOrUpdatePeerByUrlInput>;
  CreateOrUpdatePeerByUrlMutationResponse: Partial<CreateOrUpdatePeerByUrlMutationResponse>;
  CreateOutgoingPaymentInput: Partial<CreateOutgoingPaymentInput>;
  CreatePaymentPointerInput: Partial<CreatePaymentPointerInput>;
  CreatePaymentPointerKeyInput: Partial<CreatePaymentPointerKeyInput>;
  CreatePaymentPointerKeyMutationResponse: Partial<CreatePaymentPointerKeyMutationResponse>;
  CreatePaymentPointerMutationResponse: Partial<CreatePaymentPointerMutationResponse>;
  CreatePaymentPointerWithdrawalInput: Partial<CreatePaymentPointerWithdrawalInput>;
  CreatePeerInput: Partial<CreatePeerInput>;
  CreatePeerLiquidityWithdrawalInput: Partial<CreatePeerLiquidityWithdrawalInput>;
  CreatePeerMutationResponse: Partial<CreatePeerMutationResponse>;
  CreateQuoteInput: Partial<CreateQuoteInput>;
  CreateReceiverInput: Partial<CreateReceiverInput>;
  CreateReceiverResponse: Partial<CreateReceiverResponse>;
  DeletePeerInput: Partial<DeletePeerInput>;
  DeletePeerMutationResponse: Partial<DeletePeerMutationResponse>;
  DepositEventLiquidityInput: Partial<DepositEventLiquidityInput>;
  Fee: Partial<Fee>;
  FeeDetails: Partial<FeeDetails>;
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
  MutationResponse: ResolversInterfaceTypes<ResolversParentTypes>['MutationResponse'];
  OutgoingPayment: Partial<OutgoingPayment>;
  OutgoingPaymentConnection: Partial<OutgoingPaymentConnection>;
  OutgoingPaymentEdge: Partial<OutgoingPaymentEdge>;
  OutgoingPaymentResponse: Partial<OutgoingPaymentResponse>;
  PageInfo: Partial<PageInfo>;
  Payment: Partial<Payment>;
  PaymentConnection: Partial<PaymentConnection>;
  PaymentEdge: Partial<PaymentEdge>;
  PaymentFilter: Partial<PaymentFilter>;
  PaymentPointer: Partial<PaymentPointer>;
  PaymentPointerEdge: Partial<PaymentPointerEdge>;
  PaymentPointerKey: Partial<PaymentPointerKey>;
  PaymentPointerWithdrawal: Partial<PaymentPointerWithdrawal>;
  PaymentPointerWithdrawalMutationResponse: Partial<PaymentPointerWithdrawalMutationResponse>;
  PaymentPointersConnection: Partial<PaymentPointersConnection>;
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
  RevokePaymentPointerKeyInput: Partial<RevokePaymentPointerKeyInput>;
  RevokePaymentPointerKeyMutationResponse: Partial<RevokePaymentPointerKeyMutationResponse>;
  SetFeeInput: Partial<SetFeeInput>;
  SetFeeResponse: Partial<SetFeeResponse>;
  String: Partial<Scalars['String']['output']>;
  TransferMutationResponse: Partial<TransferMutationResponse>;
  TriggerPaymentPointerEventsInput: Partial<TriggerPaymentPointerEventsInput>;
  TriggerPaymentPointerEventsMutationResponse: Partial<TriggerPaymentPointerEventsMutationResponse>;
  UInt8: Partial<Scalars['UInt8']['output']>;
  UInt64: Partial<Scalars['UInt64']['output']>;
  UpdateAssetInput: Partial<UpdateAssetInput>;
  UpdatePaymentPointerInput: Partial<UpdatePaymentPointerInput>;
  UpdatePaymentPointerMutationResponse: Partial<UpdatePaymentPointerMutationResponse>;
  UpdatePeerInput: Partial<UpdatePeerInput>;
  UpdatePeerMutationResponse: Partial<UpdatePeerMutationResponse>;
  VoidLiquidityWithdrawalInput: Partial<VoidLiquidityWithdrawalInput>;
  WebhookEvent: Partial<WebhookEvent>;
  WebhookEventFilter: Partial<WebhookEventFilter>;
  WebhookEventsConnection: Partial<WebhookEventsConnection>;
  WebhookEventsEdge: Partial<WebhookEventsEdge>;
  WithdrawEventLiquidityInput: Partial<WithdrawEventLiquidityInput>;
};

export type AmountResolvers<ContextType = any, ParentType extends ResolversParentTypes['Amount'] = ResolversParentTypes['Amount']> = {
  assetCode?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  assetScale?: Resolver<ResolversTypes['UInt8'], ParentType, ContextType>;
  value?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type AssetResolvers<ContextType = any, ParentType extends ResolversParentTypes['Asset'] = ResolversParentTypes['Asset']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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

export type BasePaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['BasePayment'] = ResolversParentTypes['BasePayment']> = {
  __resolveType: TypeResolveFn<'IncomingPayment' | 'OutgoingPayment' | 'Payment', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type CreateOrUpdatePeerByUrlMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateOrUpdatePeerByUrlMutationResponse'] = ResolversParentTypes['CreateOrUpdatePeerByUrlMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type CreatePaymentPointerKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreatePaymentPointerKeyMutationResponse'] = ResolversParentTypes['CreatePaymentPointerKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  paymentPointerKey?: Resolver<Maybe<ResolversTypes['PaymentPointerKey']>, ParentType, ContextType>;
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

export type CreateReceiverResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['CreateReceiverResponse'] = ResolversParentTypes['CreateReceiverResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  receiver?: Resolver<Maybe<ResolversTypes['Receiver']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type DeletePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['DeletePeerMutationResponse'] = ResolversParentTypes['DeletePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
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
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['LiquidityError']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type ModelResolvers<ContextType = any, ParentType extends ResolversParentTypes['Model'] = ResolversParentTypes['Model']> = {
  __resolveType: TypeResolveFn<'Asset' | 'Fee' | 'IncomingPayment' | 'OutgoingPayment' | 'Payment' | 'PaymentPointer' | 'PaymentPointerKey' | 'Peer' | 'WebhookEvent', ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
};

export type MutationResolvers<ContextType = any, ParentType extends ResolversParentTypes['Mutation'] = ResolversParentTypes['Mutation']> = {
  addAssetLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddAssetLiquidityArgs, 'input'>>;
  addPeerLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationAddPeerLiquidityArgs, 'input'>>;
  createAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateAssetArgs, 'input'>>;
  createAssetLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreateAssetLiquidityWithdrawalArgs, 'input'>>;
  createIncomingPayment?: Resolver<ResolversTypes['IncomingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateIncomingPaymentArgs, 'input'>>;
  createOrUpdatePeerByUrl?: Resolver<ResolversTypes['CreateOrUpdatePeerByUrlMutationResponse'], ParentType, ContextType, RequireFields<MutationCreateOrUpdatePeerByUrlArgs, 'input'>>;
  createOutgoingPayment?: Resolver<ResolversTypes['OutgoingPaymentResponse'], ParentType, ContextType, RequireFields<MutationCreateOutgoingPaymentArgs, 'input'>>;
  createPaymentPointer?: Resolver<ResolversTypes['CreatePaymentPointerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePaymentPointerArgs, 'input'>>;
  createPaymentPointerKey?: Resolver<Maybe<ResolversTypes['CreatePaymentPointerKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePaymentPointerKeyArgs, 'input'>>;
  createPaymentPointerWithdrawal?: Resolver<Maybe<ResolversTypes['PaymentPointerWithdrawalMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePaymentPointerWithdrawalArgs, 'input'>>;
  createPeer?: Resolver<ResolversTypes['CreatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationCreatePeerArgs, 'input'>>;
  createPeerLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationCreatePeerLiquidityWithdrawalArgs, 'input'>>;
  createQuote?: Resolver<ResolversTypes['QuoteResponse'], ParentType, ContextType, RequireFields<MutationCreateQuoteArgs, 'input'>>;
  createReceiver?: Resolver<ResolversTypes['CreateReceiverResponse'], ParentType, ContextType, RequireFields<MutationCreateReceiverArgs, 'input'>>;
  deletePeer?: Resolver<ResolversTypes['DeletePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationDeletePeerArgs, 'input'>>;
  depositEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationDepositEventLiquidityArgs, 'input'>>;
  postLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationPostLiquidityWithdrawalArgs, 'input'>>;
  revokePaymentPointerKey?: Resolver<Maybe<ResolversTypes['RevokePaymentPointerKeyMutationResponse']>, ParentType, ContextType, RequireFields<MutationRevokePaymentPointerKeyArgs, 'input'>>;
  setFee?: Resolver<ResolversTypes['SetFeeResponse'], ParentType, ContextType, RequireFields<MutationSetFeeArgs, 'input'>>;
  triggerPaymentPointerEvents?: Resolver<ResolversTypes['TriggerPaymentPointerEventsMutationResponse'], ParentType, ContextType, RequireFields<MutationTriggerPaymentPointerEventsArgs, 'input'>>;
  updateAsset?: Resolver<ResolversTypes['AssetMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdateAssetArgs, 'input'>>;
  updatePaymentPointer?: Resolver<ResolversTypes['UpdatePaymentPointerMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdatePaymentPointerArgs, 'input'>>;
  updatePeer?: Resolver<ResolversTypes['UpdatePeerMutationResponse'], ParentType, ContextType, RequireFields<MutationUpdatePeerArgs, 'input'>>;
  voidLiquidityWithdrawal?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationVoidLiquidityWithdrawalArgs, 'input'>>;
  withdrawEventLiquidity?: Resolver<Maybe<ResolversTypes['LiquidityMutationResponse']>, ParentType, ContextType, RequireFields<MutationWithdrawEventLiquidityArgs, 'input'>>;
};

export type MutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['MutationResponse'] = ResolversParentTypes['MutationResponse']> = {
  __resolveType: TypeResolveFn<'AssetMutationResponse' | 'CreateOrUpdatePeerByUrlMutationResponse' | 'CreatePaymentPointerKeyMutationResponse' | 'CreatePaymentPointerMutationResponse' | 'CreatePeerMutationResponse' | 'DeletePeerMutationResponse' | 'LiquidityMutationResponse' | 'PaymentPointerWithdrawalMutationResponse' | 'RevokePaymentPointerKeyMutationResponse' | 'SetFeeResponse' | 'TransferMutationResponse' | 'TriggerPaymentPointerEventsMutationResponse' | 'UpdatePaymentPointerMutationResponse' | 'UpdatePeerMutationResponse', ParentType, ContextType>;
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
};

export type OutgoingPaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['OutgoingPayment'] = ResolversParentTypes['OutgoingPayment']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  debitAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  error?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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

export type PaymentResolvers<ContextType = any, ParentType extends ResolversParentTypes['Payment'] = ResolversParentTypes['Payment']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  state?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  type?: Resolver<ResolversTypes['PaymentType'], ParentType, ContextType>;
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

export type PaymentPointerResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointer'] = ResolversParentTypes['PaymentPointer']> = {
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  incomingPayments?: Resolver<Maybe<ResolversTypes['IncomingPaymentConnection']>, ParentType, ContextType, Partial<PaymentPointerIncomingPaymentsArgs>>;
  outgoingPayments?: Resolver<Maybe<ResolversTypes['OutgoingPaymentConnection']>, ParentType, ContextType, Partial<PaymentPointerOutgoingPaymentsArgs>>;
  publicName?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  quotes?: Resolver<Maybe<ResolversTypes['QuoteConnection']>, ParentType, ContextType, Partial<PaymentPointerQuotesArgs>>;
  status?: Resolver<ResolversTypes['PaymentPointerStatus'], ParentType, ContextType>;
  url?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentPointerEdgeResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointerEdge'] = ResolversParentTypes['PaymentPointerEdge']> = {
  cursor?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  node?: Resolver<ResolversTypes['PaymentPointer'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PaymentPointerKeyResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointerKey'] = ResolversParentTypes['PaymentPointerKey']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  jwk?: Resolver<ResolversTypes['Jwk'], ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  revoked?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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

export type PaymentPointersConnectionResolvers<ContextType = any, ParentType extends ResolversParentTypes['PaymentPointersConnection'] = ResolversParentTypes['PaymentPointersConnection']> = {
  edges?: Resolver<Array<ResolversTypes['PaymentPointerEdge']>, ParentType, ContextType>;
  pageInfo?: Resolver<ResolversTypes['PageInfo'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type PeerResolvers<ContextType = any, ParentType extends ResolversParentTypes['Peer'] = ResolversParentTypes['Peer']> = {
  asset?: Resolver<ResolversTypes['Asset'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  http?: Resolver<ResolversTypes['Http'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
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
  asset?: Resolver<Maybe<ResolversTypes['Asset']>, ParentType, ContextType, RequireFields<QueryAssetArgs, 'id'>>;
  assets?: Resolver<ResolversTypes['AssetsConnection'], ParentType, ContextType, Partial<QueryAssetsArgs>>;
  incomingPayment?: Resolver<Maybe<ResolversTypes['IncomingPayment']>, ParentType, ContextType, RequireFields<QueryIncomingPaymentArgs, 'id'>>;
  outgoingPayment?: Resolver<Maybe<ResolversTypes['OutgoingPayment']>, ParentType, ContextType, RequireFields<QueryOutgoingPaymentArgs, 'id'>>;
  paymentPointer?: Resolver<Maybe<ResolversTypes['PaymentPointer']>, ParentType, ContextType, RequireFields<QueryPaymentPointerArgs, 'id'>>;
  paymentPointers?: Resolver<ResolversTypes['PaymentPointersConnection'], ParentType, ContextType, Partial<QueryPaymentPointersArgs>>;
  payments?: Resolver<ResolversTypes['PaymentConnection'], ParentType, ContextType, Partial<QueryPaymentsArgs>>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType, RequireFields<QueryPeerArgs, 'id'>>;
  peers?: Resolver<ResolversTypes['PeersConnection'], ParentType, ContextType, Partial<QueryPeersArgs>>;
  quote?: Resolver<Maybe<ResolversTypes['Quote']>, ParentType, ContextType, RequireFields<QueryQuoteArgs, 'id'>>;
  webhookEvents?: Resolver<ResolversTypes['WebhookEventsConnection'], ParentType, ContextType, Partial<QueryWebhookEventsArgs>>;
};

export type QuoteResolvers<ContextType = any, ParentType extends ResolversParentTypes['Quote'] = ResolversParentTypes['Quote']> = {
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  debitAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  expiresAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  highEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  id?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  lowEstimatedExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  maxPacketAmount?: Resolver<ResolversTypes['UInt64'], ParentType, ContextType>;
  minExchangeRate?: Resolver<ResolversTypes['Float'], ParentType, ContextType>;
  paymentPointerId?: Resolver<ResolversTypes['ID'], ParentType, ContextType>;
  receiveAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  receiver?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
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

export type ReceiverResolvers<ContextType = any, ParentType extends ResolversParentTypes['Receiver'] = ResolversParentTypes['Receiver']> = {
  completed?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  createdAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  expiresAt?: Resolver<Maybe<ResolversTypes['String']>, ParentType, ContextType>;
  id?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  incomingAmount?: Resolver<Maybe<ResolversTypes['Amount']>, ParentType, ContextType>;
  metadata?: Resolver<Maybe<ResolversTypes['JSONObject']>, ParentType, ContextType>;
  paymentPointerUrl?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  receivedAmount?: Resolver<ResolversTypes['Amount'], ParentType, ContextType>;
  updatedAt?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type RevokePaymentPointerKeyMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['RevokePaymentPointerKeyMutationResponse'] = ResolversParentTypes['RevokePaymentPointerKeyMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  paymentPointerKey?: Resolver<Maybe<ResolversTypes['PaymentPointerKey']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type SetFeeResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['SetFeeResponse'] = ResolversParentTypes['SetFeeResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  fee?: Resolver<Maybe<ResolversTypes['Fee']>, ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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

export interface UInt8ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt8'], any> {
  name: 'UInt8';
}

export interface UInt64ScalarConfig extends GraphQLScalarTypeConfig<ResolversTypes['UInt64'], any> {
  name: 'UInt64';
}

export type UpdatePaymentPointerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdatePaymentPointerMutationResponse'] = ResolversParentTypes['UpdatePaymentPointerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  paymentPointer?: Resolver<Maybe<ResolversTypes['PaymentPointer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
  __isTypeOf?: IsTypeOfResolverFn<ParentType, ContextType>;
};

export type UpdatePeerMutationResponseResolvers<ContextType = any, ParentType extends ResolversParentTypes['UpdatePeerMutationResponse'] = ResolversParentTypes['UpdatePeerMutationResponse']> = {
  code?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  message?: Resolver<ResolversTypes['String'], ParentType, ContextType>;
  peer?: Resolver<Maybe<ResolversTypes['Peer']>, ParentType, ContextType>;
  success?: Resolver<ResolversTypes['Boolean'], ParentType, ContextType>;
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
  Amount?: AmountResolvers<ContextType>;
  Asset?: AssetResolvers<ContextType>;
  AssetEdge?: AssetEdgeResolvers<ContextType>;
  AssetMutationResponse?: AssetMutationResponseResolvers<ContextType>;
  AssetsConnection?: AssetsConnectionResolvers<ContextType>;
  BasePayment?: BasePaymentResolvers<ContextType>;
  CreateOrUpdatePeerByUrlMutationResponse?: CreateOrUpdatePeerByUrlMutationResponseResolvers<ContextType>;
  CreatePaymentPointerKeyMutationResponse?: CreatePaymentPointerKeyMutationResponseResolvers<ContextType>;
  CreatePaymentPointerMutationResponse?: CreatePaymentPointerMutationResponseResolvers<ContextType>;
  CreatePeerMutationResponse?: CreatePeerMutationResponseResolvers<ContextType>;
  CreateReceiverResponse?: CreateReceiverResponseResolvers<ContextType>;
  DeletePeerMutationResponse?: DeletePeerMutationResponseResolvers<ContextType>;
  Fee?: FeeResolvers<ContextType>;
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
  MutationResponse?: MutationResponseResolvers<ContextType>;
  OutgoingPayment?: OutgoingPaymentResolvers<ContextType>;
  OutgoingPaymentConnection?: OutgoingPaymentConnectionResolvers<ContextType>;
  OutgoingPaymentEdge?: OutgoingPaymentEdgeResolvers<ContextType>;
  OutgoingPaymentResponse?: OutgoingPaymentResponseResolvers<ContextType>;
  PageInfo?: PageInfoResolvers<ContextType>;
  Payment?: PaymentResolvers<ContextType>;
  PaymentConnection?: PaymentConnectionResolvers<ContextType>;
  PaymentEdge?: PaymentEdgeResolvers<ContextType>;
  PaymentPointer?: PaymentPointerResolvers<ContextType>;
  PaymentPointerEdge?: PaymentPointerEdgeResolvers<ContextType>;
  PaymentPointerKey?: PaymentPointerKeyResolvers<ContextType>;
  PaymentPointerWithdrawal?: PaymentPointerWithdrawalResolvers<ContextType>;
  PaymentPointerWithdrawalMutationResponse?: PaymentPointerWithdrawalMutationResponseResolvers<ContextType>;
  PaymentPointersConnection?: PaymentPointersConnectionResolvers<ContextType>;
  Peer?: PeerResolvers<ContextType>;
  PeerEdge?: PeerEdgeResolvers<ContextType>;
  PeersConnection?: PeersConnectionResolvers<ContextType>;
  Query?: QueryResolvers<ContextType>;
  Quote?: QuoteResolvers<ContextType>;
  QuoteConnection?: QuoteConnectionResolvers<ContextType>;
  QuoteEdge?: QuoteEdgeResolvers<ContextType>;
  QuoteResponse?: QuoteResponseResolvers<ContextType>;
  Receiver?: ReceiverResolvers<ContextType>;
  RevokePaymentPointerKeyMutationResponse?: RevokePaymentPointerKeyMutationResponseResolvers<ContextType>;
  SetFeeResponse?: SetFeeResponseResolvers<ContextType>;
  TransferMutationResponse?: TransferMutationResponseResolvers<ContextType>;
  TriggerPaymentPointerEventsMutationResponse?: TriggerPaymentPointerEventsMutationResponseResolvers<ContextType>;
  UInt8?: GraphQLScalarType;
  UInt64?: GraphQLScalarType;
  UpdatePaymentPointerMutationResponse?: UpdatePaymentPointerMutationResponseResolvers<ContextType>;
  UpdatePeerMutationResponse?: UpdatePeerMutationResponseResolvers<ContextType>;
  WebhookEvent?: WebhookEventResolvers<ContextType>;
  WebhookEventsConnection?: WebhookEventsConnectionResolvers<ContextType>;
  WebhookEventsEdge?: WebhookEventsEdgeResolvers<ContextType>;
};

