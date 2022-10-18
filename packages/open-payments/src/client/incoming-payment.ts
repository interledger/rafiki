import { AxiosInstance } from 'axios'
import { OpenAPI, HttpMethod } from 'openapi'
import { IncomingPayment, getPath } from '../types'
import { GetArgs, get } from './requests'

export const getIncomingPayment = async (
  axios: AxiosInstance,
  openApi: OpenAPI,
  args: GetArgs
): Promise<IncomingPayment> => {
  return get(
    axios,
    args,
    openApi.createResponseValidator({
      path: getPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })
  )
}
