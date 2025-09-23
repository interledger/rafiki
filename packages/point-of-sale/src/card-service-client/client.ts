import {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  HttpStatusCode
} from 'axios'
import { CardServiceClientError } from './errors'
import { v4 as uuid } from 'uuid'
import { BaseService } from '../shared/baseService'

interface Amount {
  value: string
  assetScale: number
  assetCode: string
}

export interface SendPaymentArgs {
  signature: string
  payload: string
  amount: Amount
  incomingPaymentUrl: string
  senderWalletAddress: string
  timestamp: number
}

interface CardServicePaymentRequest extends SendPaymentArgs {
  requestId: string
}

export interface CardServiceClient {
  sendPayment(cardServiceUrl: string, options: SendPaymentArgs): Promise<Result>
}

interface ServiceDependencies extends BaseService {
  axios: AxiosInstance
}

export enum Result {
  APPROVED = 'approved',
  CARD_EXPIRED = 'card_expired',
  INVALID_SIGNATURE = 'invalid_signature'
}

export type PaymentResponse = {
  requestId: string
  result: Result
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isResult = (x: any): x is Result => Object.values(Result).includes(x)

// eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
const isPaymentResponse = (x: any): x is PaymentResponse =>
  typeof x.requestId === 'string' && isResult(x.result)

export async function createCardServiceClient({
  logger,
  axios
}: ServiceDependencies): Promise<CardServiceClient> {
  const log = logger.child({
    service: 'PosDeviceService'
  })
  const deps: ServiceDependencies = {
    logger: log,
    axios
  }
  return {
    sendPayment: (cardServiceUrl, options) =>
      sendPayment(deps, cardServiceUrl, options)
  }
}

async function sendPayment(
  deps: ServiceDependencies,
  cardServiceUrl: string,
  args: SendPaymentArgs
): Promise<Result> {
  try {
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const requestBody: CardServicePaymentRequest = {
      ...args,
      requestId: uuid()
    }
    const response = await deps.axios.post<PaymentResponse>(
      `${cardServiceUrl + (cardServiceUrl.endsWith('/') ? 'payment' : '/payment')}`,
      requestBody,
      config
    )
    const payment = response.data
    if (!payment) {
      throw new CardServiceClientError(
        'No payment information was received',
        HttpStatusCode.NotFound
      )
    }
    return payment.result
  } catch (error) {
    deps.logger.debug(error)
    if (error instanceof CardServiceClientError) throw error

    if (error instanceof AxiosError) {
      if (isPaymentResponse(error.response?.data)) {
        return error.response.data.result
      }
      throw new CardServiceClientError(
        error.response?.data ?? 'Unknown Axios error',
        error.response?.status ?? HttpStatusCode.ServiceUnavailable
      )
    }

    throw new CardServiceClientError(
      typeof error === 'string'
        ? error
        : 'Something went wrong when calling the card service',
      HttpStatusCode.ServiceUnavailable
    )
  }
}
