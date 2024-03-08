import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'http'
import { v4 as uuid } from 'uuid'
import {
  AccountProvider,
  WebhookEventType,
  Webhook
} from 'mock-account-servicing-lib'
import { TestConfig } from './config'
import { AdminClient } from './apolloClient'

export class IntegrationServer {
  private config: TestConfig
  private app: Koa
  private server?: http.Server
  public webhookEventHandler: WebhookEventHandler

  constructor(
    config: TestConfig,
    adminClient: AdminClient,
    accounts: AccountProvider
  ) {
    this.config = config
    this.app = new Koa()
    this.app.use(bodyParser())
    this.webhookEventHandler = new WebhookEventHandler(adminClient, accounts)
  }

  public start(port: number): void {
    this.app.use(async (ctx) => {
      if (ctx.path === '/webhooks' && ctx.method === 'POST') {
        const { body } = ctx.request

        if (this.isWebhookEvent(body)) {
          this.webhookEventHandler.handleWebhookEvent(body)
          ctx.status = 200
          ctx.body = 'Webhook received'
        } else {
          ctx.status = 400
          ctx.body = 'Invalid WebhookEvent payload'
        }
      }

      if (ctx.path === '/rates' && ctx.method === 'GET') {
        const { base } = ctx.query
        ctx.body = {
          base,
          rates: {
            ...this.config.seed.rates[base as string]
          }
        }
      }
    })

    this.server = this.app.listen(port, () => {
      console.log(`Integration server listening on port ${port}`)
    })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private isWebhookEvent(body: any): body is Webhook {
    return (
      typeof body === 'object' &&
      typeof body.id === 'string' &&
      typeof body.type === 'string' &&
      typeof body.data === 'object'
    )
  }

  public async close(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.server) return resolve()

      this.server.close((err) => {
        if (err) {
          reject(err)
        }

        resolve()
      })
    })
  }
}

export class WebhookEventHandler {
  private adminClient: AdminClient
  private accounts: AccountProvider

  constructor(adminClient: AdminClient, accounts: AccountProvider) {
    this.adminClient = adminClient
    this.accounts = accounts
  }

  public async handleWebhookEvent(webhookEvent: Webhook) {
    console.log('handling webhook')
    console.log((await this.accounts.listAll())[0].walletAddress)
    switch (webhookEvent.type) {
      case WebhookEventType.WalletAddressNotFound:
        await this.handleWalletAddressNotFound(webhookEvent)
        break
      case WebhookEventType.IncomingPaymentCreated:
        console.log('incoming payment created')
        // await this.handleIncomingPaymentCreated(webhookEvent)
        break
      case WebhookEventType.IncomingPaymentCompleted:
        console.log('incoming payemnt completed')
        break
      case WebhookEventType.OutgoingPaymentCreated:
        console.log('outgoing payemnt created')
        await this.handleOutgoingPaymentCreated(webhookEvent)
        break
      case WebhookEventType.OutgoingPaymentCompleted:
        console.log('outgoing payemnt completed')
        break
      default:
        console.log(`unknown event type: ${webhookEvent.type}`)
    }
  }

  private async handleWalletAddressNotFound(webhookEvent: Webhook) {
    const walletAddressUrl = webhookEvent.data['walletAddressUrl']

    if (!walletAddressUrl || typeof walletAddressUrl !== 'string') {
      throw new Error('No walletAddressUrl found')
    }

    const accountPath = new URL(walletAddressUrl).pathname.substring(1)
    const account = await this.accounts.getByPath(accountPath)

    if (!account) {
      throw new Error('No account found for wallet address')
    }

    // TODO: create wallet address via apolloClient
  }

  private async handleOutgoingPaymentCreated(webhookEvent: Webhook) {
    const payment = webhookEvent.data
    const walletAddressId = payment['walletAddressId'] as string
    const account = await this.accounts.getByWalletAddressId(walletAddressId)

    if (!account) {
      throw new Error('No account found for wallet address')
    }

    if (typeof payment.id !== 'string' || !payment.id) {
      throw new Error('No payment id found')
    }

    let amount: bigint
    try {
      amount = BigInt((payment.debitAmount as { value: string }).value)
    } catch (err) {
      throw new Error('Invalid debitAmount on payment')
    }

    await this.accounts.pendingDebit(account.id, amount)

    const response = await this.adminClient.depositOutgoingPaymentLiquidity({
      outgoingPaymentId: payment.id,
      idempotencyKey: uuid()
    })

    if (response.code !== '200') {
      const msg = 'Deposit outgoing payment liquidity failed'
      console.log(msg, { response })
      throw new Error(msg)
    }

    // TODO: remove this debug log
    console.log({ response })

    return
  }

  // private async handleOutgoingPaymentCompletedFailed(webhookEvent: Webhook) {
  //   const payment = webhookEvent.data
  //   const walletAddressId = payment.walletAddressId
  //   if (typeof walletAddressId !== 'string') {
  //     throw new Error('No walletAddressId found')
  //   }
  //   const account = await this.accounts.getByWalletAddressId(walletAddressId)

  //   if (!account) {
  //     throw new Error(
  //       `No account found for walletAddressId: ${walletAddressId}`
  //     )
  //   }

  //   console.log({
  //     'payment.sentAmount': payment.sentAmount,
  //     'payment.debitAmount': payment.debitAmount
  //   })

  //   // 'payment.sentAmount': { value: '0', assetCode: 'USD', assetScale: 2 },
  //   // 'payment.debitAmount': { value: '617', assetCode: 'USD', assetScale: 2 }

  //   let sentAmount: bigint
  //   let debitAmount: bigint

  //   try {
  //     sentAmount = BigInt((payment.sentAmount as any).value)
  //     debitAmount = BigInt((payment.debitAmount as any).value)
  //   } catch (err) {
  //     throw new Error('Invalid sentAmount or debitAmount')
  //   }

  //   const toVoid = debitAmount - sentAmount

  //   await this.accounts.debit(account.id, sentAmount, true)
  //   if (toVoid > 0) {
  //     await this.accounts.voidPendingDebit(account.id, toVoid)
  //   }

  //   // TODO: withdraw remaining liquidity

  //   return
  // }

  // private async handleIncomingPaymentCreated(webhookEvent: Webhook) {
  //   console.log('handleIncomingPaymentCreated')
  //   console.log({ webhookEvent })
  // }
}
