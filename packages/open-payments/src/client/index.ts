import { createOpenAPI } from 'openapi'

import { ILPStreamConnection, IncomingPayment } from '../types'
import config from '../config'
import { getIncomingPayment } from './incoming-payment'
import { getILPStreamConnection } from './ilp-stream-connection'
import { createAxiosInstance, GetArgs } from './requests'

export interface CreateOpenPaymentClientArgs {
  timeout?: number
}

export interface OpenPaymentsClient {
  incomingPayment: {
    get(args: GetArgs): Promise<IncomingPayment>
  }
  ilpStreamConnection: {
    get(args: GetArgs): Promise<ILPStreamConnection>
  }
}

export const createClient = async (
  args?: CreateOpenPaymentClientArgs
): Promise<OpenPaymentsClient> => {
  const axios = createAxiosInstance(args)
  const openApi = await createOpenAPI(config.OPEN_PAYMENTS_OPEN_API_URL)

  return {
    incomingPayment: {
      get: (args: GetArgs) => getIncomingPayment(axios, openApi, args)
    },
    ilpStreamConnection: {
      get: (args: GetArgs) => getILPStreamConnection(axios, openApi, args)
    }
  }
}
