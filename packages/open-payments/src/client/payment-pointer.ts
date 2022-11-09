import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import { JWKS, PaymentPointer, getPath } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface PaymentPointerRoutes {
  get(args: GetArgs): Promise<PaymentPointer>
  getKeys(args: GetArgs): Promise<JWKS>
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

  const getPaymentPaymentKeysValidator = openApi.createResponseValidator<JWKS>({
    path: getPath('/jwks.json'),
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
