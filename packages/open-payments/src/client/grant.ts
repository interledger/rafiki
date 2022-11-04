import { HttpMethod } from 'openapi'
import { ClientDeps } from '.'
import {
  getASPath,
  InteractiveGrant,
  InteractiveGrantRequest,
  NonInteractiveGrant,
  NonInteractiveGrantRequest
} from '../types'
import { post } from './requests'

interface RequestGrantArgs<T> {
  url: string
  request: T
}

export interface GrantRoutes {
  requestInteractiveGrant(
    args: RequestGrantArgs<InteractiveGrantRequest>
  ): Promise<InteractiveGrant>
  requestNonInteractiveGrant(
    args: RequestGrantArgs<NonInteractiveGrantRequest>
  ): Promise<NonInteractiveGrant>
}

export const createGrantRoutes = (clientDeps: ClientDeps): GrantRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

  const createInteractiveGrantValidator =
    openApi.createResponseValidator<InteractiveGrant>({
      path: getASPath('/'),
      method: HttpMethod.POST
    })
  const createNonInteractiveGrantValidator =
    openApi.createResponseValidator<NonInteractiveGrant>({
      path: getASPath('/'),
      method: HttpMethod.POST
    })

  return {
    requestInteractiveGrant: (
      args: RequestGrantArgs<InteractiveGrantRequest>
    ) =>
      post(
        { axiosInstance, logger },
        { url: args.url, body: args.request },
        createInteractiveGrantValidator
      ),
    requestNonInteractiveGrant: (
      args: RequestGrantArgs<NonInteractiveGrantRequest>
    ) =>
      post(
        { axiosInstance, logger },
        { url: args.url, body: args.request },
        createNonInteractiveGrantValidator
      )
  }
}
