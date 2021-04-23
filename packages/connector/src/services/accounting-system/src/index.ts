import bodyParser from 'koa-bodyparser'
import {
  PeersService,
  AccountsService,
  AccountSnapshot
} from '@interledger/rafiki-core'
import { normalizeAsset } from '@interledger/rafiki-utils'
import { createSettlementApiRoutes } from './routes'
import Koa, { Context } from 'koa'
import { Server } from 'http'
import { IlpPrepare, IlpReply } from 'ilp-packet'
import {
  SettlementEngineService,
  SettlementResponse,
  SettlementEngine
} from './services/settlement-engine'
import getRawBody = require('raw-body')

export interface AccountingSystemConfig {
  peers: PeersService;
  accounts: AccountsService;
  settlementEngines: SettlementEngineService;
  host?: string;
  port?: number;
}

export interface AccountingSystemContext extends Context {
  services: {
    peers: PeersService;
    accounts: AccountsService;
  };
}

export class AccountingSystem {
  private _peersService: PeersService
  private _accountsService: AccountsService
  private _app: Koa
  private _server: Server
  private _settlementEngineService: SettlementEngineService

  constructor (config: AccountingSystemConfig) {
    this._peersService = config.peers
    this._accountsService = config.accounts
    this._settlementEngineService = config.settlementEngines
    this._app = new Koa<any, AccountingSystemContext>()

    this._app.use(async (ctx, next) => {
      if (ctx.request.headers['content-type'] === 'application/octet-stream') {
        ctx.disableBodyParser = true
        ctx.request.body = await getRawBody(ctx.req)
      }
      await next()
    })
    this._app.use(bodyParser())
    this._app.use(createSettlementApiRoutes().middleware())
  }

  private async getAccountOrThrow (accountId: string): Promise<AccountSnapshot> {
    const account = await this._accountsService.get(accountId)
    if (!account) throw new Error('Account not found')
    return account
  }

  private async getAccountSettlementEngineOrThrow (
    account: AccountSnapshot
  ): Promise<SettlementEngine> {
    if (!account.settlementEngine) {
      throw new Error('No settlement Engine defined for account')
    }
    const settlementEngine = await this._settlementEngineService.get(
      account.settlementEngine
    )
    if (!settlementEngine) throw new Error('Settlement Engine not found')
    return settlementEngine
  }

  /**
   * Hoist information about the account out of accountService and try and add to SE corresponding SE
   * @param accountId Id of the account
   */
  async addAccount (accountId: string): Promise<void> {
    const account = await this.getAccountOrThrow(accountId)

    const engine = await this.getAccountSettlementEngineOrThrow(account)

    // TODO this may need to go to retry queue
    await engine.addAccount(account.id)
  }

  async removeAccount (accountId: string): Promise<void> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = await this.getAccountSettlementEngineOrThrow(account)

    await engine.removeAccount(account.id)
  }

  async receiveRequest (
    accountId: string,
    packet: IlpPrepare
  ): Promise<IlpReply> {
    const account = await this.getAccountOrThrow(accountId)
    const engine = await this.getAccountSettlementEngineOrThrow(account)

    return engine.receiveRequest(account.id, packet)
  }

  async sendSettlement (
    account: AccountSnapshot,
    amount: bigint,
    scale: number
  ): Promise<void> {
    const engine = await this.getAccountSettlementEngineOrThrow(account)

    const response: SettlementResponse = await engine.sendSettlement(
      account.id,
      amount,
      scale
    )

    if (response.scale > scale) {
      throw new Error(
        'Cant process scale with greater precision than account settings'
      )
    }

    const normalizedAmount = normalizeAsset(
      response.scale,
      account.assetScale,
      BigInt(response.amount)
    )

    await this._accountsService.adjustBalancePayable(
      -normalizedAmount,
      account.id,
      async ({ commit }) => {
        await commit()
      }
    )
  }

  async maybeSettle (accountSnapshot: AccountSnapshot): Promise<void> {
    // Quick check if must settle based on the snapshot data
    const settle =
      accountSnapshot.settlementThreshold &&
      accountSnapshot.balancePayable > accountSnapshot.settlementThreshold
    // Are not required to settle so return
    if (!settle && typeof accountSnapshot.settleTo !== 'undefined') return

    // TODO this needs an optimization if you are settling often (ie every packet)
    // Get account and check using current values! as the snapshot may be out of date
    const account = await this.getAccountOrThrow(accountSnapshot.id)
    const shouldSettle =
      account.settlementThreshold &&
      account.balancePayable > account.settlementThreshold

    // Check using latest data
    if (!shouldSettle && typeof account.settleTo !== 'undefined') return

    const settleAmount = account.balancePayable - account.settleTo!

    try {
      await this.sendSettlement(account, settleAmount, account.assetScale)
    } catch (error) {
      console.log('Error settling!')
    }
  }

  public listen (): void {
    if (!this._server) {
      this._server = this._app.listen()
    }
    this._accountsService.updated.subscribe(this.maybeSettle)
  }

  public shutdown (): void {
    if (this._server) {
      this._server.close()
    }
  }
}
