import { createHmac } from 'crypto'
import { App, AppServices } from './app'
import { Config } from './config/app'
import { Ioc, IocContract } from '@adonisjs/fold'
import createLogger from 'pino'
import Redis from 'ioredis'
import { createPaymentService } from './payment/service'
import { createPaymentRoutes } from './payment/routes'
import { createOpenAPI } from '@interledger/openapi'
import path from 'path'
import {
  createHttpLink,
  ApolloClient,
  ApolloLink,
  InMemoryCache
} from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'
import { print } from 'graphql'
import { canonicalize } from 'json-canonicalize'

export function initIocContainer(
  config: typeof Config
): IocContract<AppServices> {
  const container: IocContract<AppServices> = new Ioc()
  container.singleton('config', async () => config)

  container.singleton('logger', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = createLogger()
    logger.level = config.logLevel
    return logger
  })

  container.singleton('redis', async (deps): Promise<Redis> => {
    const config = await deps.use('config')
    return new Redis(config.redisUrl, {
      tls: config.redisTls,
      stringNumbers: true
    })
  })

  container.singleton('apolloClient', async (deps) => {
    const [logger, config] = await Promise.all([
      deps.use('logger'),
      deps.use('config')
    ])

    const httpLink = createHttpLink({
      uri: config.graphqlUrl
    })

    const errorLink = onError(({ graphQLErrors }) => {
      if (graphQLErrors) {
        logger.error(graphQLErrors)
        graphQLErrors.map(({ extensions }) => {
          if (extensions && extensions.code === 'UNAUTHENTICATED') {
            logger.error('UNAUTHENTICATED')
          }

          if (extensions && extensions.code === 'FORBIDDEN') {
            logger.error('FORBIDDEN')
          }
        })
      }
    })

    const authLink = setContext((request, { headers }) => {
      if (!config.tenantSecret || !config.tenantSignatureVersion)
        return { headers }
      const timestamp = Date.now()
      const version = config.tenantSignatureVersion

      const { query, variables, operationName } = request
      const formattedRequest = {
        variables,
        operationName,
        query: print(query)
      }

      const payload = `${timestamp}.${canonicalize(formattedRequest)}`
      const hmac = createHmac('sha256', config.tenantSecret)
      hmac.update(payload)
      const digest = hmac.digest('hex')

      const link = {
        headers: {
          ...headers,
          'tenant-id': `${config.tenantId}`,
          signature: `t=${timestamp}, v${version}=${digest}`
        }
      }

      return link
    })

    const link = ApolloLink.from([errorLink, authLink, httpLink])

    const client = new ApolloClient({
      cache: new InMemoryCache({}),
      link: link,
      defaultOptions: {
        query: {
          fetchPolicy: 'no-cache'
        },
        mutate: {
          fetchPolicy: 'no-cache'
        },
        watchQuery: {
          fetchPolicy: 'no-cache'
        }
      }
    })

    return client
  })

  container.singleton('openApi', async () => {
    const cardServerSpec = await createOpenAPI(
      path.resolve(__dirname, './openapi/specs/card-server.yaml')
    )

    return {
      cardServerSpec
    }
  })

  container.singleton(
    'paymentService',
    async (deps: IocContract<AppServices>) => {
      return createPaymentService({
        logger: await deps.use('logger'),
        config: await deps.use('config'),
        apolloClient: await deps.use('apolloClient')
      })
    }
  )

  container.singleton(
    'paymentRoutes',
    async (deps: IocContract<AppServices>) => {
      return createPaymentRoutes({
        logger: await deps.use('logger'),
        paymentService: await deps.use('paymentService')
      })
    }
  )

  return container
}

export const start = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  let shuttingDown = false
  const logger = await container.use('logger')
  process.on('SIGINT', async (): Promise<void> => {
    logger.info('received SIGINT attempting graceful shutdown')
    try {
      if (shuttingDown) {
        logger.warn(
          'received second SIGINT during graceful shutdown, exiting forcefully.'
        )
        process.exit(1)
      }

      shuttingDown = true

      // Graceful shutdown
      await gracefulShutdown(container, app)
      logger.info('completed graceful shutdown.')
      process.exit(0)
    } catch (err) {
      const errInfo = err instanceof Error && err.stack ? err.stack : err
      logger.error({ err: errInfo }, 'error while shutting down')
      process.exit(1)
    }
  })

  process.on('SIGTERM', async (): Promise<void> => {
    logger.info('received SIGTERM attempting graceful shutdown')

    try {
      if (shuttingDown) {
        logger.warn(
          'received second SIGTERM during graceful shutdown, exiting forcefully.'
        )
        process.exit(1)
      }

      shuttingDown = true
      // Graceful shutdown
      await gracefulShutdown(container, app)
      logger.info('completed graceful shutdown.')
      process.exit(0)
    } catch (err) {
      const errInfo = err instanceof Error && err.stack ? err.stack : err
      logger.error({ err: errInfo }, 'error while shutting down')
      process.exit(1)
    }
  })

  const config = await container.use('config')

  await app.boot()

  await app.startCardServiceServer(config.cardServicePort)
  logger.info(`Card service listening on ${app.getCardServicePort()}`)
}

if (require.main === module) {
  const container = initIocContainer(Config)
  const app = new App(container)

  start(container, app).catch(async (e): Promise<void> => {
    const errInfo = e && typeof e === 'object' && e.stack ? e.stack : e
    const logger = await container.use('logger')
    logger.error({ err: errInfo })
  })
}

export const gracefulShutdown = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  const logger = await container.use('logger')
  logger.info('shutting down.')
  await app.shutdown()
}
