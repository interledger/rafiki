import { AxiosInstance } from 'axios'
import { OpenAPI, HttpMethod } from 'openapi'
import { IncomingPayment, getPath } from '../types'
import { GetArgs, get } from './requests'

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
}

export const createIncomingPaymentRoutes = (
  axios: AxiosInstance,
  openApi: OpenAPI
): IncomingPaymentRoutes => {
  const getIncomingPaymentValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) => get(axios, args, getIncomingPaymentValidator)
  }
}
