import { KeyLike } from 'crypto'
import { createOpenAPI, OpenAPI } from 'openapi'
import path from 'path'
import createLogger, { Logger } from 'pino'
import config from '../config'
import {
  createIncomingPaymentRoutes,
  IncomingPaymentRoutes
} from './incoming-payment'
import {
  createILPStreamConnectionRoutes,
  ILPStreamConnectionRoutes
} from './ilp-stream-connection'
import {
  createPaymentPointerRoutes,
  PaymentPointerRoutes
} from './payment-pointer'
import { createAxiosInstance } from './requests'
import { AxiosInstance } from 'axios'
import { createGrantRoutes, GrantRoutes } from './grant'
import {
  createOutgoingPaymentRoutes,
  OutgoingPaymentRoutes
} from './outgoing-payment'
import { createTokenRoutes, TokenRoutes } from './token'
import { createQuoteRoutes, QuoteRoutes } from './quote'

/** @hidden */
export interface BaseDeps {
  axiosInstance: AxiosInstance
  logger: Logger
}

/** @hidden */
interface ClientDeps extends BaseDeps {
  resourceServerOpenApi: OpenAPI
  authServerOpenApi: OpenAPI
}

/** @hidden */
export interface RouteDeps extends BaseDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
}

export interface UnauthenticatedResourceRequestArgs {
  /** The full url of the resource.
   * e.g. https://openpayments.guide/alice/incoming-payments/08394f02-7b7b-45e2-b645-51d04e7c330c
   */
  url: string
}

interface AuthenticatedRequestArgs {
  accessToken: string
}

export interface ResourceRequestArgs
  extends UnauthenticatedResourceRequestArgs,
    AuthenticatedRequestArgs {}

export interface CollectionRequestArgs extends AuthenticatedRequestArgs {
  paymentPointer: string
}

const createDeps = async (
  args: Partial<CreateAuthenticatedClientArgs>
): Promise<ClientDeps> => {
  const axiosInstance = createAxiosInstance({
    privateKey: args.privateKey,
    keyId: args.keyId,
    requestTimeoutMs:
      args?.requestTimeoutMs ?? config.DEFAULT_REQUEST_TIMEOUT_MS
  })
  const resourceServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/resource-server.yaml')
  )
  const authServerOpenApi = await createOpenAPI(
    path.resolve(__dirname, '../openapi/auth-server.yaml')
  )
  const logger = args?.logger ?? createLogger()
  return {
    axiosInstance,
    resourceServerOpenApi,
    authServerOpenApi,
    logger
  }
}

export interface CreateUnauthenticatedClientArgs {
  /** Milliseconds to wait before timing out an HTTP request */
  requestTimeoutMs?: number
  /** The custom logger instance to use. This defaults to the pino logger. */
  logger?: Logger
}

export interface UnauthenticatedClient {
  ilpStreamConnection: ILPStreamConnectionRoutes
  paymentPointer: PaymentPointerRoutes
}

/**
 * Creates an OpenPayments client that only makes unauthenticated requests.
 */
export const createUnauthenticatedClient = async (
  args: CreateUnauthenticatedClientArgs
): Promise<UnauthenticatedClient> => {
  const { axiosInstance, resourceServerOpenApi, logger } = await createDeps(
    args
  )

  return {
    ilpStreamConnection: createILPStreamConnectionRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    }),
    paymentPointer: createPaymentPointerRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    })
  }
}

export interface CreateAuthenticatedClientArgs
  extends CreateUnauthenticatedClientArgs {
  privateKey: KeyLike
  keyId: string
  paymentPointerUrl: string
}

export interface AuthenticatedClient extends UnauthenticatedClient {
  incomingPayment: IncomingPaymentRoutes
  outgoingPayment: OutgoingPaymentRoutes
  grant: GrantRoutes
  token: TokenRoutes
  quote: QuoteRoutes
}

export const createAuthenticatedClient = async (
  args: CreateAuthenticatedClientArgs
): Promise<AuthenticatedClient> => {
  const { axiosInstance, resourceServerOpenApi, authServerOpenApi, logger } =
    await createDeps(args)

  return {
    incomingPayment: createIncomingPaymentRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    }),
    outgoingPayment: createOutgoingPaymentRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    }),
    ilpStreamConnection: createILPStreamConnectionRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    }),
    paymentPointer: createPaymentPointerRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    }),
    grant: createGrantRoutes({
      axiosInstance,
      openApi: authServerOpenApi,
      logger,
      client: args.paymentPointerUrl
    }),
    token: createTokenRoutes({
      axiosInstance,
      openApi: authServerOpenApi,
      logger
    }),
    quote: createQuoteRoutes({
      axiosInstance,
      openApi: resourceServerOpenApi,
      logger
    })
  }
}

// const cl = await createAuthenticatedClient({
//   keyId:'',
//   paymentPointerUrl:'',
//   privateKey: ''
// })

// cl.grant.cancel({
//   url:
// })
