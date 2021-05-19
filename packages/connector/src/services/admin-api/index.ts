import {
  Rafiki,
  RafikiMiddleware,
  AccountsService
} from '../core'
import { Context } from 'koa'
import createRouter, { Joi } from 'koa-joi-router'
import bodyParser from 'koa-bodyparser'
import { Server } from 'http'
import createLogger from 'pino'

const logger = createLogger()

export interface AdminApiOptions {
  host?: string
  port?: number
}

export interface AdminApiServices {
  auth: RafikiMiddleware
  accounts?: AccountsService
}

/**
 * TODO - Current design assumes that the same token service is used for /peer end point functions AND auth of the API
 */
export class AdminApi {
  private _koa: Rafiki
  private _httpServer?: Server
  private _host?: string
  private _port?: number
  constructor(
    { host, port }: AdminApiOptions,
    { accounts }: AdminApiServices
  ) {
    this._koa = new Rafiki()
    // this._koa.use(createAuthMiddleware(auth))
    this._koa.use(this._getRoutes(accounts).middleware())
    this._host = host
    this._port = port
  }

  shutdown(): void {
    if (this._httpServer) this._httpServer.close()
  }

  listen(): void {
    const adminApiHost = this._host || '0.0.0.0'
    const adminApiPort = this._port || 7780

    this._httpServer = this._koa.listen(adminApiPort, adminApiHost)
    logger.info(
      `admin api listening. host=${adminApiHost} port=${adminApiPort}`
    )
  }

  private _getRoutes(
    accounts?: AccountsService
  ): createRouter.Router {
    const middlewareRouter = createRouter()

    middlewareRouter.use(bodyParser())
    middlewareRouter.route({
      method: 'get',
      path: '/health',
      handler: async (ctx: Context) => {
        ctx.body = 'Status: ok'
      }
    })
    middlewareRouter.route({
      method: 'get',
      path: '/stats',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    middlewareRouter.route({
      method: 'get',
      path: '/alerts',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    middlewareRouter.route({
      method: 'get',
      path: '/balance',
      handler: async (ctx: Context) => ctx.assert(false, 500, 'not implemented')
    })
    if (accounts) {
      middlewareRouter.route({
        method: 'get',
        path: '/balance/:id',
        handler: async (ctx: Context) => {
          try {
            const account = await accounts.getAccount(ctx.request.params.id)
            ctx.body = account
          } catch (error) {
            ctx.response.status = 404
          }
        }
      })
    }
    /*
    middlewareRouter.route({
      method: 'post',
      path: '/peers',
      validate: {
        body: {
          id: Joi.string().required(),
          relation: Joi.string().required(),
          url: Joi.string().optional()
        },
        type: 'json'
      },
      handler: async (ctx: Context) => {
        const peerInfo = ctx.request.body
        const peer = await peers.add(peerInfo)
        // const account = await accounts.set()
        // TODO: Do we create the token automatically
        // await tokenService.create({ sub: peerInfo.id, active: true })
        ctx.response.body = peer
        ctx.response.status = 201
      }
    })
    middlewareRouter.route({
      method: 'get',
      path: '/peers',
      handler: async (ctx: Context) => {
        ctx.body = await peers.list()
      }
    })
    */
    // router.route({
    //   method: 'get',
    //   path: '/peers/:id/token',
    //   handler: async (ctx: Context) => {
    //     const token = await tokenService.lookup({ sub: ctx.params.id, active: true })
    //     ctx.body = {
    //       token
    //     }
    //   }
    // })

    // TODO: Wait for Matt to add this to connector
    // router.route({
    //   method: 'get',
    //   path: '/routes',
    //   handler: async (ctx: Context) => ctx.body = app._connector._routingTable.getRoutingTable()['items']
    // })
    return middlewareRouter
  }
}
