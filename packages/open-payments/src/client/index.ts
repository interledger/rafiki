import { KeyLike } from 'crypto'
import { createOpenAPI, OpenAPI } from 'openapi'
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

interface ClientDeps {
  axiosInstance: AxiosInstance
  resourceServerOpenApi: OpenAPI
  authorizationServerOpenApi: OpenAPI
  logger: Logger
}

export interface RouteDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
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
    config.OPEN_PAYMENTS_RS_OPEN_API_URL
  )
  const authorizationServerOpenApi = await createOpenAPI(
    config.OPEN_PAYMENTS_AS_OPEN_API_URL
  )
  const logger = args?.logger ?? createLogger()
  return {
    axiosInstance,
    resourceServerOpenApi,
    authorizationServerOpenApi,
    logger
  }
}

export interface CreateUnauthenticatedClientArgs {
  requestTimeoutMs?: number
  logger?: Logger
}

export interface UnauthenticatedClient {
  ilpStreamConnection: ILPStreamConnectionRoutes
  paymentPointer: PaymentPointerRoutes
}

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
}

export interface AuthenticatedClient extends UnauthenticatedClient {
  incomingPayment: IncomingPaymentRoutes
  grant: GrantRoutes
}

export const createAuthenticatedClient = async (
  args: CreateAuthenticatedClientArgs
): Promise<AuthenticatedClient> => {
  const {
    axiosInstance,
    resourceServerOpenApi,
    authorizationServerOpenApi,
    logger
  } = await createDeps(args)

  return {
    incomingPayment: createIncomingPaymentRoutes({
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
      openApi: authorizationServerOpenApi,
      logger
    })
  }
}
