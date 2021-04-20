import { v4 as uuid } from 'uuid'

import { IlpAccountSettings } from '../models'
// import { Client } from 'tigerbeetle-node'

import { AccountInfo } from '../../core/types'
import { AccountNotFoundError } from '../../core/errors'
// import { Errors } from 'ilp-packet'
import {
  AccountsService as ConnectorAccountsService,
  Transaction
} from '../../core/services/accounts'
// const { InsufficientLiquidityError } = Errors

export class AccountsService implements ConnectorAccountsService {
  // private _client: Client
  // eslint-disable-next-line
  private _client: any

  // constructor(client: Client) {
  //   this._client = client
  // }

  async get(id: string): Promise<AccountInfo> {
    const accountSettings = await IlpAccountSettings.query().findById(id)
    if (!accountSettings) {
      throw new AccountNotFoundError(id)
    }
    return accountSettings
  }

  public async adjustBalances(
    amount: bigint,
    incomingAccountId: string,
    outgoingAccountId: string,
    callback: (trx: Transaction) => Promise<unknown>
  ): Promise<void> {
    const incomingAccountSettings = await IlpAccountSettings.query().findById(
      incomingAccountId
    )
    const outgoingAccountSettings = await IlpAccountSettings.query().findById(
      outgoingAccountId
    )
    if (amount > BigInt(0)) {
      const transferId = Buffer.from(uuid())
      const transaction: Transaction = {
        commit: async () => {
          const res = await this._client.commitTransfers([
            {
              id: transferId,
              flags: {
                // accept
              }
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
              flags: {
                // reject
              }
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
            debitAccountId: Buffer.from(incomingAccountSettings.balanceId),
            creditAccountId: Buffer.from(outgoingAccountSettings.balanceId),
            amount
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
}
