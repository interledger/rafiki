import { v4 as uuid } from 'uuid'
import { Client, CommitFlags } from 'tigerbeetle-node'

import { IlpAccountSettings } from '../models'
import { toLiquidityId, toSettlementId, uuidToBigInt } from '../utils'

// import { Errors } from 'ilp-packet'
import {
  AccountsService as ConnectorAccountsService,
  AdjustmentOptions,
  IlpAccount,
  IlpBalance,
  Transaction
} from '../../core/services/accounts'
// const { InsufficientLiquidityError } = Errors

const CUSTOM_FIELDS = {
  custom_1: BigInt(0),
  custom_2: BigInt(0),
  custom_3: BigInt(0)
}

export interface BalanceOptions {
  id: bigint
  unit: bigint
}

function toIlpAccountSettings(
  // account: CreateIlpAccountOptions,
  account: IlpAccount,
  balanceId: string
) {
  return {
    id: account.accountId,
    disabled: account.disabled,
    assetCode: account.asset.code,
    assetScale: account.asset.scale,
    balanceId,
    parentAccountId: account.parentAccountId,
    incomingTokens: account.http && account.http.incoming.authTokens,
    incomingEndpoint: account.http && account.http.incoming.endpoint,
    outgoingToken: account.http && account.http.outgoing.authToken,
    outgoingEndpoint: account.http && account.http.outgoing.endpoint,
    streamEnabled: account.stream && account.stream.enabled,
    staticIlpAddress: account.routing && account.routing.staticIlpAddress
  }
}

export class AccountsService implements ConnectorAccountsService {
  private _client: Client

  async getAccount(_accountId: string): Promise<IlpAccount> {
    throw new Error('unimplemented')
  }
  async getAccountByDestinationAddress(
    _destinationAddress: string
  ): Promise<IlpAccount> {
    throw new Error('unimplemented')
  }
  async getAccountByToken(_token: string): Promise<IlpAccount | null> {
    throw new Error('unimplemented')
  }
  async getAccountBalance(_accountId: string): Promise<IlpBalance> {
    throw new Error('unimplemented')
  }

  constructor(client: Client) {
    this._client = client
  }

  public async adjustBalances({
    sourceAmount,
    sourceAccountId,
    destinationAccountId,
    callback
  }: AdjustmentOptions): Promise<void> {
    const sourceAccount = await IlpAccountSettings.query().findById(
      sourceAccountId
    )
    const destinationAccount = await IlpAccountSettings.query().findById(
      destinationAccountId
    )
    if (sourceAmount > BigInt(0)) {
      const transferId = uuidToBigInt(uuid())
      const transaction: Transaction = {
        commit: async () => {
          const res = await this._client.commitTransfers([
            {
              id: transferId,
              flags: 0n | BigInt(CommitFlags.accept),
              ...CUSTOM_FIELDS
            }
          ])
          if (res.length) {
            // throw
          }
        },
        rollback: async () => {
          const res = await this._client.commitTransfers([
            {
              id: transferId,
              flags: 0n | BigInt(CommitFlags.reject),
              ...CUSTOM_FIELDS
            }
          ])
          if (res.length) {
            // throw
          }
        }
      }

      try {
        const res = await this._client.createTransfers([
          {
            id: transferId,
            debit_account_id: uuidToBigInt(sourceAccount.balanceId),
            credit_account_id: uuidToBigInt(destinationAccount.balanceId),
            amount: sourceAmount,
            ...CUSTOM_FIELDS,
            flags: BigInt(0),
            timeout: BigInt(1000)
          }
        ])
        if (res.length) {
          // throw new InsufficientLiquidityError()
        }

        await callback(transaction)
      } catch (error) {
        // Should this rethrow the error?
        throw error(error)
      }
    }
  }

  public async createAccount(
    account: IlpAccount
  ): Promise<IlpAccount> {
    const balanceId = uuid()
    await this.createBalance({
      id: uuidToBigInt(balanceId),
      unit: BigInt(account.asset.scale)
    })
    await IlpAccountSettings.query().insertAndFetch(
      toIlpAccountSettings(account, balanceId)
    )
    await this.createCurrencyBalances(account.asset.code, account.asset.scale)
    return account
  }

  private async createCurrencyBalances(
    assetCode: string,
    assetScale: number
  ): Promise<void> {
    await this.createBalance({
      id: toSettlementId(assetCode, assetScale),
      unit: BigInt(assetScale)
    })
    await this.createBalance({
      id: toLiquidityId(assetCode, assetScale),
      unit: BigInt(assetScale)
      // min: BigInt(0)
    })
  }

  private async createBalance({ id, unit }: BalanceOptions): Promise<void> {
    await this._client.createAccounts([
      {
        id,
        custom: BigInt(0),
        flags: BigInt(0),
        unit,
        debit_accepted: BigInt(0),
        debit_reserved: BigInt(0),
        credit_accepted: BigInt(0),
        credit_reserved: BigInt(0),
        debit_accepted_limit: BigInt(0),
        debit_reserved_limit: BigInt(0),
        credit_accepted_limit: BigInt(0),
        credit_reserved_limit: BigInt(0),
        timestamp: 0n
        // limit_net_debit: balance.min,
        // limit_net_credit: balance.max
      }
    ])
  }
}
