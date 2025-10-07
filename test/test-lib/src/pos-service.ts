import axios, { Axios, AxiosRequestConfig } from 'axios'

export interface PaymentDetails {
  signature: string
  payload: string
  amount: {
    value: string
    assetScale: number
    assetCode: string
  }
  senderWalletAddress: string
  receiverWalletAddress: string
  timestamp: number
}

export interface PaymentResponse {
  result: {
    code: Result
  }
}

export enum Result {
  APPROVED = 'approved',
  INVALID_SIGNATURE = 'invalid_signature'
}

export class PosService {
  private client: Axios | undefined
  constructor(baseURL?: string) {
    if (baseURL) {
      this.client = axios.create({
        baseURL,
        timeout: 30_000
      })
    }
  }

  async createPayment(args: PaymentDetails): Promise<PaymentResponse> {
    if (!this.client) {
      throw new Error('POS service not configured')
    }
    const config: AxiosRequestConfig = {
      headers: {
        Accept: 'application/json'
      }
    }
    const result = await this.client.post<PaymentResponse>(
      '/payment',
      args,
      config
    )
    return result.data
  }
}
