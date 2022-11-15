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

export interface ClientDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
}

const createDeps = async (
  args: Partial<CreateOpenPaymentClientArgs>
): Promise<ClientDeps> => {
  const axiosInstance = createAxiosInstance({
    privateKey: args.privateKey,
    keyId: args.keyId,
    requestTimeoutMs:
      args?.requestTimeoutMs ?? config.DEFAULT_REQUEST_TIMEOUT_MS
  })
  const openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  const logger = args?.logger ?? createLogger()
  return { axiosInstance, openApi, logger }
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
  args: CreateOpenPaymentClientArgs
): Promise<UnauthenticatedClient> => {
  const deps = await createDeps(args)

  return {
    ilpStreamConnection: createILPStreamConnectionRoutes(deps),
    paymentPointer: createPaymentPointerRoutes(deps)
  }
}

export interface CreateOpenPaymentClientArgs
  extends CreateUnauthenticatedClientArgs {
  privateKey: KeyLike
  keyId: string
}

export interface OpenPaymentsClient extends UnauthenticatedClient {
  incomingPayment: IncomingPaymentRoutes
}

export const createClient = async (
  args: CreateOpenPaymentClientArgs
): Promise<OpenPaymentsClient> => {
  const deps = await createDeps(args)

  return {
    incomingPayment: createIncomingPaymentRoutes(deps),
    ilpStreamConnection: createILPStreamConnectionRoutes(deps),
    paymentPointer: createPaymentPointerRoutes(deps)
  }
}
