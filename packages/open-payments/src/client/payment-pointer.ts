import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { JWKS, PaymentPointer, getRSPath } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface PaymentPointerRoutes {
  get(args: GetArgs): Promise<PaymentPointer>
  getKeys(args: GetArgs): Promise<JWKS>
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

  const getPaymentPaymentKeysValidator = openApi.createResponseValidator<JWKS>({
    path: getRSPath('/jwks.json'),
    method: HttpMethod.GET
  })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getPaymentPaymentValidator),
    getKeys: (args: GetArgs) =>
      get(
        { axiosInstance, logger },
        {
          url: `${args.url}/jwks.json`
        },
        getPaymentPaymentKeysValidator
      )
  }
}
