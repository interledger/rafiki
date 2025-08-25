import {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  HttpStatusCode
} from 'axios'
import { CardServiceClientError } from './errors'
import { v4 as uuid } from 'uuid'
import { BaseService } from '../shared/baseService'

interface Card {
  trasactionCounter: number
  expiry: Date
  // TODO: replace with WalletAddress from payment service
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  walletAddress: any
}

export interface PaymentOptions {
  merchantWalletAddress: string
  incomingPaymentUrl: string
  date: Date
  signature: string
  card: Card
  incomingAmount: {
    assetCode: string
    assetScale: number
    value: string
  }
}

export interface CardServiceClient {
  sendPayment(options: PaymentOptions): Promise<Result>
}

interface ServiceDependencies extends BaseService {
  axios: AxiosInstance
}
interface PaymentOptionsWithReqId extends PaymentOptions {
  requestId: string
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
    sendPayment: (options) => sendPayment(deps, options)
  }
}

async function sendPayment(
  deps: ServiceDependencies,
  options: PaymentOptions
): Promise<Result> {
  try {
    const config: AxiosRequestConfig = {
      headers: {
        'Content-Type': 'application/json'
      }
    }
    const requestBody: PaymentOptionsWithReqId = {
      ...options,
      requestId: uuid()
    }
    const cardServiceUrl = options.card.walletAddress.cardService
    const response = await deps.axios.post<PaymentResponse>(
      `${cardServiceUrl}/payment`,
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
