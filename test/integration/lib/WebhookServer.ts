import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import http from 'http'

export class WebhookServer {
  private app: Koa
  private server?: http.Server

  constructor() {
    this.app = new Koa()
    this.app.use(bodyParser())
  }

  public start(port: number): void {
    this.app.use(async (ctx) => {
      // if (ctx.path === '/webhook' && ctx.method === 'POST') {
      //   console.log('Received webhook payload:', ctx.request.body)
      //   ctx.status = 200
      //   ctx.body = 'Webhook received successfully!'
      // }
      if (ctx.path === '/webhook') {
        console.log('Received webhook payload:', ctx.request.body)
        ctx.status = 200
        ctx.body = 'Webhook received successfully!'
      }
    })

    this.server = this.app.listen(port, () => {
      console.log(`Webhook server listening on port ${port}`)
    })
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
