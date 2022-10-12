import { components } from './types'
import axios, { AxiosInstance } from 'axios'

type IncomingPayment = components['schemas']['incoming-payment']

interface CreateOpenPaymentClientArgs {
  timeout?: number
}

interface GetArgs {
  url: string
  accessToken: string
}

interface OpenPaymentsClient {
  incomingPayment: {
    get(args: GetArgs): Promise<IncomingPayment>
  }
}

const get = async <T>(axios: AxiosInstance, args: GetArgs): Promise<T> => {
  const { url, accessToken } = args

  const headers = {
    'Content-Type': 'application/json'
  }

  if (accessToken) {
    headers['Authorization'] = `GNAP ${accessToken}`
    // TODO: https://github.com/interledger/rafiki/issues/587
    headers['Signature'] = 'TODO'
    headers['Signature-Input'] = 'TODO'
  }

  const { data } = await axios.get(url, {
    headers
  })

  return data
}

const getIncomingPayment = async (
  axios: AxiosInstance,
  args: GetArgs
): Promise<IncomingPayment> => {
  return get(axios, args)
}

const createClient = (
  args: CreateOpenPaymentClientArgs
): OpenPaymentsClient => {
  const { timeout } = args

  const axiosInstance = axios.create({
    timeout
  })

  return {
    incomingPayment: {
      get: (getArgs: GetArgs) => getIncomingPayment(axiosInstance, getArgs)
    }
  }
}

const openPaymentsClient = createClient({
  timeout: 5_000
})

const incomingPayment = await openPaymentsClient.incomingPayment.get({
  url: '',
  accessToken: ''
})


incomingPayment.
export { IncomingPayment, OpenPaymentsClient, createClient }
