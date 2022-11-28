import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { getRSPath, ILPStreamConnection } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface ILPStreamConnectionRoutes {
  get(args: GetArgs): Promise<ILPStreamConnection>
}

export const createILPStreamConnectionRoutes = (
  deps: RouteDeps
): ILPStreamConnectionRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getILPStreamConnectionValidator =
    openApi.createResponseValidator<ILPStreamConnection>({
      path: getRSPath('/connections/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getILPStreamConnectionValidator)
  }
}
