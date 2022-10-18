import { AxiosInstance } from 'axios'
import { OpenAPI, HttpMethod } from 'openapi'
import { getPath, ILPStreamConnection } from '../types'
import { GetArgs, get } from './requests'

export const getILPStreamConnection = async (
  axios: AxiosInstance,
  openApi: OpenAPI,
  args: GetArgs
): Promise<ILPStreamConnection> => {
  return get(
    axios,
    args,
    openApi.createResponseValidator({
      path: getPath('/connections/{id}'),
      method: HttpMethod.GET
    })
  )
}
