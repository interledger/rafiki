import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import { IncomingPayment, getPath } from '../types'
import { GetArgs, get } from './requests'

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
}

export const createIncomingPaymentRoutes = (
  clientDeps: ClientDeps
): IncomingPaymentRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

  const getIncomingPaymentValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getIncomingPaymentValidator)
  }
}
