import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { PaymentPointer, getRSPath } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface PaymentPointerRoutes {
  get(args: GetArgs): Promise<PaymentPointer>
}

export const createPaymentPointerRoutes = (
  deps: RouteDeps
): PaymentPointerRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getPaymentPaymentValidator =
    openApi.createResponseValidator<PaymentPointer>({
      path: getRSPath('/'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getPaymentPaymentValidator)
  }
}
