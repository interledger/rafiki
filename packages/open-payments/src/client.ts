import { ILPStreamConnection, IncomingPayment } from './types'
import axios, { AxiosInstance } from 'axios'
import config from '../config.js'

interface CreateOpenPaymentClientArgs {
  timeout?: number
}

interface GetArgs {
  url: string
  accessToken: string
}

export interface OpenPaymentsClient {
  incomingPayment: {
    get(args: GetArgs): Promise<IncomingPayment>
  }
  ilpStreamConnection: {
    get(args: GetArgs): Promise<ILPStreamConnection>
  }
}

const get = async <T>(axios: AxiosInstance, args: GetArgs): Promise<T> => {
  const { url, accessToken } = args

  const { data } = await axios.get(url, {
    headers: accessToken
      ? {
          Authorization: `GNAP ${accessToken}`,
          Signature: 'TODO',
          'Signature-Input': 'TODO'
        }
      : {}
  })

  return data
}

export const createClient = (
  args?: CreateOpenPaymentClientArgs
): OpenPaymentsClient => {
  const defaultTimeout = config['DEFAULT_REQUEST_TIMEOUT'] || 3_000
  const axiosInstance = axios.create({
    timeout: args.timeout || defaultTimeout
  })

  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  return {
    incomingPayment: {
      get: (args: GetArgs) => get<IncomingPayment>(axios, args)
    },
    ilpStreamConnection: {
      get: (args: GetArgs) => get<ILPStreamConnection>(axios, args)
    }
  }
}
