import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import { getRSPath, ILPStreamConnection } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface ILPStreamConnectionRoutes {
  get(args: GetArgs): Promise<ILPStreamConnection>
}

export const createILPStreamConnectionRoutes = (
  clientDeps: ClientDeps
): ILPStreamConnectionRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

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
