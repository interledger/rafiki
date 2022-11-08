import { Server } from 'http'
import { EventEmitter } from 'events'

import { IocContract } from '@adonisjs/fold'
import { Knex } from 'knex'
import Koa, { DefaultState, DefaultContext } from 'koa'
import bodyParser from 'koa-bodyparser'
import session from 'koa-session'
import { Logger } from 'pino'
import Router from '@koa/router'

import { IAppConfig } from './config/app'
import { ClientService } from './client/service'
import { GrantService } from './grant/service'
import { AccessTokenRoutes } from './accessToken/routes'
import { createValidatorMiddleware, HttpMethod } from 'openapi'

import {
  grantInitiationHttpsigMiddleware,
  grantContinueHttpsigMiddleware,
  tokenHttpsigMiddleware
} from './signature/middleware'

export interface AppContextData extends DefaultContext {
  logger: Logger
  closeEmitter: EventEmitter
  container: AppContainer
  // Set by @koa/router
  params: { [key: string]: string }
  // Set by koa-generic-session
  session: { [key: string]: string }
}

export type AppContext = Koa.ParameterizedContext<DefaultState, AppContextData>

export interface DatabaseCleanupRule {
  /**
   * the name of the column containing the starting time from which the age will be computed
   * ex: `createdAt` or `updatedAt`
   */
  absoluteStartTimeColumnName: string
  /**
   * the name of the column containing the time offset, in seconds, since
   * `absoluteStartTimeColumnName`, which specifies when the row expires
   */
  expirationOffsetColumnName: string
  /**
   * the minimum number of days since expiration before rows of
   * this table will be considered safe to delete during clean up
   */
  defaultExpirationOffsetDays: number
}

export interface AppServices {
  logger: Promise<Logger>
  knex: Promise<Knex>
  closeEmitter: Promise<EventEmitter>
  config: Promise<IAppConfig>
  // TODO: Add GNAP-related services
  clientService: Promise<ClientService>
  grantService: Promise<GrantService>
  accessTokenRoutes: Promise<AccessTokenRoutes>
}

export type AppContainer = IocContract<AppServices>

export class App {
  private koa!: Koa<DefaultState, AppContext>
  private publicRouter!: Router<DefaultState, AppContext>
  private server!: Server
  private closeEmitter!: EventEmitter
  private logger!: Logger
  private config!: IAppConfig
  private databaseCleanupRules!: {
    [tableName: string]: DatabaseCleanupRule | undefined
  }
  public isShuttingDown = false

  public constructor(private container: IocContract<AppServices>) {}

  /**
   * The boot function exists because the functions that we register on the container with the `bind` method are async.
   * We then need to await this function when we call use - which can't be done in the constructor. This is a first pass to
   * get the container working. We can refactor this in future. Perhaps don't use private members and just pass around the container?
   * Or provide start / shutdown methods on the services in the container?
   */
  public async boot(): Promise<void> {
    this.config = await this.container.use('config')
    this.koa = new Koa<DefaultState, AppContext>()
    this.closeEmitter = await this.container.use('closeEmitter')
    this.logger = await this.container.use('logger')
    this.koa.context.container = this.container
    this.koa.context.logger = await this.container.use('logger')
    this.koa.context.closeEmitter = await this.container.use('closeEmitter')
    this.publicRouter = new Router<DefaultState, AppContext>()
    this.databaseCleanupRules = {
      accessTokens: {
        absoluteStartTimeColumnName: 'createdAt',
        expirationOffsetColumnName: 'expiresIn',
        defaultExpirationOffsetDays: this.config.accessTokenDeletionDays
      }
    }

    this.koa.keys = [this.config.cookieKey]
    this.koa.use(
      session(
        {
          key: 'sessionId',
          // TODO: make this time shorter?
          maxAge: 60 * 1000,
          signed: true
        },
        // Only accepts Middleware<DefaultState, DefaultContext> for some reason, this.koa is Middleware<DefaultState, AppContext>
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        this.koa as any
      )
    )
    this.koa.use(
      async (
        ctx: {
          status: number
          set: (arg0: string, arg1: string) => void
          body: string
        },
        next: () => void | PromiseLike<void>
      ): Promise<void> => {
        if (this.isShuttingDown) {
          ctx.status = 503
          ctx.set('Connection', 'close')
          ctx.body = 'Server is in the process of restarting'
        } else {
          return next()
        }
      }
    )

    await this._setupRoutes()

    if (this.config.env !== 'test') {
      for (let i = 0; i < this.config.databaseCleanupWorkers; i++) {
        process.nextTick(() => this.processDatabaseCleanup())
      }
    }
  }

  public listen(port: number | string): void {
    this.server = this.koa.listen(port)
  }

  public async shutdown(): Promise<void> {
    return new Promise((resolve): void => {
      if (this.server) {
        this.isShuttingDown = true
        this.closeEmitter.emit('shutdown')
        this.server.close((): void => {
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  public getPort(): number {
    const address = this.server?.address()
    if (address && !(typeof address == 'string')) {
      return address.port
    }
    return 0
  }

  private async _setupRoutes(): Promise<void> {
    this.publicRouter.use(bodyParser())
    this.publicRouter.get('/healthz', (ctx: AppContext): void => {
      ctx.status = 200
    })

    this.publicRouter.get('/discovery', (ctx: AppContext): void => {
      ctx.body = {
        grant_request_endpoint: '/',
        interaction_start_modes_supported: ['redirect'],
        interaction_finish_modes_supported: ['redirect']
      }
    })

    const accessTokenRoutes = await this.container.use('accessTokenRoutes')
    const grantRoutes = await this.container.use('grantRoutes')

    this.logger.info(
      `Auth server - Open API validation inactive: ${this.config.bypassOpenApiValidation}`
    )

    const openApi = await this.container.use('openApi')
    /* Back-channel GNAP Routes */
    // Grant Initiation
    this.publicRouter.post(
      '/',
      createValidatorMiddleware(
        openApi,
        {
          path: '/',
          method: HttpMethod.POST
        },
        this.config.bypassOpenApiValidation
      ),
      grantInitiationHttpsigMiddleware,
      grantRoutes.create
    )

    // Grant Continue
    this.publicRouter.post(
      '/continue/:id',
      createValidatorMiddleware(
        openApi,
        {
          path: '/continue/{id}',
          method: HttpMethod.POST
        },
        this.config.bypassOpenApiValidation
      ),
      grantContinueHttpsigMiddleware,
      grantRoutes.continue
    )

    // Token Rotation
    this.publicRouter.post(
      '/token/:id',
      createValidatorMiddleware(
        openApi,
        {
          path: '/token/{id}',
          method: HttpMethod.POST
        },
        this.config.bypassOpenApiValidation
      ),
      tokenHttpsigMiddleware,
      accessTokenRoutes.rotate
    )

    // Token Revocation
    this.publicRouter.delete(
      '/token/:id',
      createValidatorMiddleware(
        openApi,
        {
          path: '/token/{id}',
          method: HttpMethod.DELETE
        },
        this.config.bypassOpenApiValidation
      ),
      tokenHttpsigMiddleware,
      accessTokenRoutes.revoke
    )

    /* AS <-> RS Routes */
    // Token Introspection
    this.publicRouter.post(
      '/introspect',
      createValidatorMiddleware(
        openApi,
        {
          path: '/introspect',
          method: HttpMethod.POST
        },
        this.config.bypassOpenApiValidation
      ),
      accessTokenRoutes.introspect
    )

    /* Front Channel Routes */
    // TODO: update front-channel routes to have /frontend prefix here and in openapi spec

    // Interaction start
    this.publicRouter.get(
      '/interact/:id/:nonce',
      createValidatorMiddleware(
        openApi,
        {
          path: '/interact/{id}/{nonce}',
          method: HttpMethod.GET
        },
        this.config.bypassOpenApiValidation
      ),
      grantRoutes.interaction.start
    )

    // Interaction finish
    this.publicRouter.get(
      '/interact/:id/:nonce/finish',
      createValidatorMiddleware(
        openApi,
        {
          path: '/interact/{id}/{nonce}/finish',
          method: HttpMethod.GET
        },
        this.config.bypassOpenApiValidation
      ),
      grantRoutes.interaction.finish
    )

    // Grant lookup
    this.publicRouter.get(
      '/grant/:id/:nonce',
      createValidatorMiddleware(
        openApi,
        {
          path: '/grant/{id}/{nonce}',
          method: HttpMethod.GET
        },
        this.config.bypassOpenApiValidation
      ),
      grantRoutes.interaction.details
    )

    // Grant accept/reject
    this.publicRouter.post(
      '/grant/:id/:nonce/:choice',
      createValidatorMiddleware(
        openApi,
        {
          path: '/grant/{id}/{nonce}/{choice}',
          method: HttpMethod.POST
        },
        this.config.bypassOpenApiValidation
      ),
      grantRoutes.interaction.acceptOrReject
    )

    this.koa.use(this.publicRouter.middleware())
  }

  private async processDatabaseCleanup(): Promise<void> {
    const knex = await this.container.use('knex')

    const tableNames = Object.keys(this.databaseCleanupRules)
    for (const tableName of tableNames) {
      const rule = this.databaseCleanupRules[tableName]
      if (rule) {
        try {
          /**
           * NOTE: do not remove seemingly pointless interpolations such as '${'??'}'
           * because they are necessary for preventing SQL injection attacks
           */
          await knex(tableName)
            .whereRaw(
              `?? + make_interval(0, 0, 0, 0, 0, 0, ??) + interval '${'??'}' < NOW()`,
              [
                rule.absoluteStartTimeColumnName,
                rule.expirationOffsetColumnName,
                `${rule.defaultExpirationOffsetDays} days`
              ]
            )
            .del()
        } catch (err) {
          this.logger.warn(
            { error: err.message, tableName },
            'processDatabaseCleanup error'
          )
        }
      }
    }
  }
}
