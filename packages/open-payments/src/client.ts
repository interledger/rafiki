import { ILPStreamConnection, IncomingPayment } from './types'
import axios, { AxiosInstance } from 'axios'
import config from './config'

interface CreateOpenPaymentClientArgs {
  timeout?: number
}

interface GetArgs {
  url: string
  accessToken?: string
}

export interface OpenPaymentsClient {
  incomingPayment: {
    get(args: GetArgs): Promise<IncomingPayment>
  }
  ilpStreamConnection: {
    get(args: GetArgs): Promise<ILPStreamConnection>
  }
}

export const get = async <T>(
  axios: AxiosInstance,
  args: GetArgs
): Promise<T> => {
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

export const createAxiosInstance = (
  args?: CreateOpenPaymentClientArgs
): AxiosInstance => {
  const axiosInstance = axios.create({
    timeout: args?.timeout ?? config.DEFAULT_REQUEST_TIMEOUT
  })

  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  return axiosInstance
}

export const createClient = (
  args?: CreateOpenPaymentClientArgs
): OpenPaymentsClient => {
  const axios = createAxiosInstance(args)

  return {
    incomingPayment: {
      get: (args: GetArgs) => get<IncomingPayment>(axios, args)
    },
    ilpStreamConnection: {
      get: (args: GetArgs) => get<ILPStreamConnection>(axios, args)
    }
  }
}
