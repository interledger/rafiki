import { AxiosInstance } from 'axios'
import { OpenAPI, HttpMethod } from 'openapi'
import { getPath, ILPStreamConnection } from '../types'
import { GetArgs, get } from './requests'

export interface ILPStreamConnectionRoutes {
  get(args: GetArgs): Promise<ILPStreamConnection>
}

export const createILPStreamConnectionRoutes = (
  axios: AxiosInstance,
  openApi: OpenAPI
): ILPStreamConnectionRoutes => {
  const getILPStreamConnectionValidator =
    openApi.createResponseValidator<ILPStreamConnection>({
      path: getPath('/connections/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) => get(axios, args, getILPStreamConnectionValidator)
  }
}
