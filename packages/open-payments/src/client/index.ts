import { createOpenAPI } from 'openapi'

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

export interface CreateOpenPaymentClientArgs {
  timeout?: number
}

export interface OpenPaymentsClient {
  incomingPayment: IncomingPaymentRoutes
  ilpStreamConnection: ILPStreamConnectionRoutes
}

export const createClient = async (
  args?: CreateOpenPaymentClientArgs
): Promise<OpenPaymentsClient> => {
  const axios = createAxiosInstance(args)
  const openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)

  return {
    incomingPayment: createIncomingPaymentRoutes(axios, openApi),
    ilpStreamConnection: createILPStreamConnectionRoutes(axios, openApi)
  }
}
