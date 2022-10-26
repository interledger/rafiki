import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import { getPath, ILPStreamConnection } from '../types'
import { GetArgs, get } from './requests'

export interface ILPStreamConnectionRoutes {
  get(args: GetArgs): Promise<ILPStreamConnection>
}

export const createILPStreamConnectionRoutes = (
  clientDeps: ClientDeps
): ILPStreamConnectionRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

  const getILPStreamConnectionValidator =
    openApi.createResponseValidator<ILPStreamConnection>({
      path: getPath('/connections/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getILPStreamConnectionValidator)
  }
}
