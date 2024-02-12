import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'http'
import {
  AccountProvider,
  WebhookEventType,
  Webhook
} from 'mock-account-servicing-lib'
import { ApolloClient, NormalizedCacheObject } from '@apollo/client'

export class WebhookServer {
  private app: Koa
  private server?: http.Server
  public webhookEventHandler: WebhookEventHandler

  constructor(
    apolloClient: ApolloClient<NormalizedCacheObject>,
    accounts: AccountProvider
  ) {
    this.app = new Koa()
    this.app.use(bodyParser())
    this.webhookEventHandler = new WebhookEventHandler(apolloClient, accounts)
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
    })

    this.server = this.app.listen(port, () => {
      console.log(`Webhook server listening on port ${port}`)
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
  private apolloClient: ApolloClient<NormalizedCacheObject>
  private accounts: AccountProvider

  constructor(
    apolloClient: ApolloClient<NormalizedCacheObject>,
    accounts: AccountProvider
  ) {
    this.apolloClient = apolloClient
    this.accounts = accounts
  }

  public async handleWebhookEvent(webhookEvent: Webhook) {
    switch (webhookEvent.type) {
      case WebhookEventType.WalletAddressNotFound:
        await this.handleWalletAddressNotFound(webhookEvent)
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
}
