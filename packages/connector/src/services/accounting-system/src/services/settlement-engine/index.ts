import { IlpPrepare, IlpReply } from 'ilp-packet'

export interface SettlementEngine {
  addAccount: (accountId: string) => Promise<void>;
  removeAccount: (accountId: string) => Promise<void>;
  receiveRequest: (accountId: string, packet: IlpPrepare) => Promise<IlpReply>;
  sendSettlement: (
    accountId: string,
    amount: bigint,
    scale: number
  ) => Promise<SettlementResponse>;
}

export interface SettlementResponse {
  amount: bigint;
  scale: number;
}

export interface SettlementEngineService {
  /**
   * Get an interface to speak to a settlement engine, throw if can't be found
   */
  get: (name: string) => Promise<SettlementEngine>;
}

export * from './remote-se'
export * from './in-memory'
