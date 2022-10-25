import { createOpenAPI, OpenAPI } from 'openapi'
import createLogger, { Logger, LevelWithSilent as LogLevel } from 'pino'
import config from '../config'
import {
  createIncomingPaymentRoutes,
  IncomingPaymentRoutes
} from './incoming-payment'
import {
  createILPStreamConnectionRoutes,
  ILPStreamConnectionRoutes
} from './ilp-stream-connection'
import { createAxiosInstance } from './requests'
import { AxiosInstance } from 'axios'

export interface CreateOpenPaymentClientArgs {
  timeout?: number
  logger?: Logger
  loggerLevel?: LogLevel
}

export interface ClientDeps {
  axiosInstance: AxiosInstance
  openApi: OpenAPI
  logger: Logger
}

export interface OpenPaymentsClient {
  incomingPayment: IncomingPaymentRoutes
  ilpStreamConnection: ILPStreamConnectionRoutes
}

export const createClient = async (
  args?: CreateOpenPaymentClientArgs
): Promise<OpenPaymentsClient> => {
  const axiosInstance = createAxiosInstance(args)
  const openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)
  const logger =
    args.logger ??
    createLogger({
      level: args.loggerLevel ?? 'info'
    })
  const deps = { axiosInstance, openApi, logger }

  return {
    incomingPayment: createIncomingPaymentRoutes(deps),
    ilpStreamConnection: createILPStreamConnectionRoutes(deps)
  }
}
