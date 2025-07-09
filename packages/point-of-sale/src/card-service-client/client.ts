import Axios, {
  AxiosError,
  AxiosInstance,
  AxiosRequestConfig,
  HttpStatusCode
} from 'axios'
import { CardServiceClientError } from './errors'
import { v4 as uuid } from 'uuid'

// TODO: Remove after Card model is defined and used below
interface Card {
  // ...
  walletAddress: {
    // ...
    cardService: string
  }
}

export interface PaymentOptions {
  merchantWalletAddress: string
  incomingPaymentUrl: string
  date: Date
  signature: string
  // TODO: Replace with Card model that has a WalletAddress
  card: Card
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

export class CardServiceClient {
  private axios: AxiosInstance

  constructor() {
    this.axios = Axios.create({ timeout: 30_000 })
  }

  public async sendPayment(options: PaymentOptions): Promise<Result> {
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
      const response = await this.axios.post<PaymentResponse>(
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
}
