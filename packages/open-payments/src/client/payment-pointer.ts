import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import { PaymentPointer, getPath } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface PaymentPointerRoutes {
  get(args: GetArgs): Promise<PaymentPointer>
}

export const createPaymentPointerRoutes = (
  clientDeps: ClientDeps
): PaymentPointerRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

  const getPaymentPaymentValidator =
    openApi.createResponseValidator<PaymentPointer>({
      path: getPath('/'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getPaymentPaymentValidator)
  }
}
