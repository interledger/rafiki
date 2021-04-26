export type Relation = 'parent' | 'child' | 'peer' | 'local'

export type PeerRelation = 'parent' | 'peer' | 'child'

// TODO change url and auth token to say out outgoingUrl and outgoingAuthToken
export interface PeerInfo {
  id: string;
  url?: string;
  relation: PeerRelation;
  relationWeight?: number;
  authToken?: string;
  isCcpSender?: boolean;
  isCcpReceiver?: boolean;
  accountId: string;
  maxPacketAmount?: bigint;
  rateLimitRefillPeriod?: number;
  rateLimitRefillCount?: bigint;
  rateLimitCapacity?: bigint;
  minExpirationWindow?: number;
  maxHoldWindow?: number;
  incomingThroughputLimitRefillPeriod?: number;
  incomingThroughputLimit?: bigint;
  outgoingThroughputLimitRefillPeriod?: number;
  outgoingThroughputLimit?: bigint;
}

export enum RelationWeights {
  parent = 400,
  peer = 300,
  child = 200,
  local = 100
}
