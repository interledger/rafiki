import { Ioc, IocContract } from '@adonisjs/fold'
import { Config } from './config/app'
import { App, AppServices } from './app'
import createLogger from 'pino'
import {
  ApolloClient,
  ApolloLink,
  createHttpLink,
  InMemoryCache
} from '@apollo/client'
import { onError } from '@apollo/client/link/error'
import { setContext } from '@apollo/client/link/context'
import { print } from 'graphql'
import { canonicalize } from 'json-canonicalize'
import { createHmac } from 'crypto'
import { createPaymentService } from './payments/service'
import { createPaymentRoutes } from './payments/routes'
import axios from 'axios'
import { createCardServiceClient } from './card-service-client/client'
import { createWebhookHandlerRoutes } from './webhook-handlers/routes'

/* eslint-disable no-var */
declare global {
  interface BigInt {
    toJSON(): string
  }
}
/* eslint-enable no-var */

// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString()
}

export function initIocContainer(
  config: typeof Config
): IocContract<AppServices> {
  const container: IocContract<AppServices> = new Ioc()

  container.singleton('config', async () => config)
  container.singleton('axios', async () => axios.create())

  container.singleton('logger', async (deps: IocContract<AppServices>) => {
    const config = await deps.use('config')
    const logger = createLogger()
    logger.level = config.logLevel
    return logger
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

  container.singleton('paymentClient', async (deps) => {
    return createPaymentService({
      apolloClient: await deps.use('apolloClient'),
      logger: await deps.use('logger'),
      config: await deps.use('config'),
      axios: await deps.use('axios')
    })
  })

  container.singleton('cardServiceClient', async (deps) => {
    return createCardServiceClient({
      logger: await deps.use('logger'),
      axios: await deps.use('axios')
    })
  })

  container.singleton('paymentRoutes', async (deps) => {
    return createPaymentRoutes({
      logger: await deps.use('logger'),
      config: await deps.use('config'),
      paymentService: await deps.use('paymentClient'),
      cardServiceClient: await deps.use('cardServiceClient')
    })
  })

  container.singleton('webhookHandlerRoutes', async (deps) => {
    return createWebhookHandlerRoutes({
      logger: await deps.use('logger')
    })
  })

  return container
}

export const gracefulShutdown = async (
  container: IocContract<AppServices>,
  app: App
): Promise<void> => {
  const logger = await container.use('logger')
  logger.info('shutting down.')
  await app.shutdown()
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

  await app.startPosServer(config.port)
  logger.info(`POS Service listening on ${app.getPort()}`)
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
