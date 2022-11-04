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

export interface CreateOpenPaymentClientArgs {
  requestTimeoutMs?: number
  logger?: Logger
}

export interface ClientDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
}

export interface OpenPaymentsClient {
  incomingPayment: IncomingPaymentRoutes
  ilpStreamConnection: ILPStreamConnectionRoutes
  paymentPointer: PaymentPointerRoutes
  grant: GrantRoutes
}

export const createClient = async (
  args?: CreateOpenPaymentClientArgs
): Promise<OpenPaymentsClient> => {
  const axiosInstance = createAxiosInstance({
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
