import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import {
  getASPath,
  InteractiveGrant,
  NonInteractiveGrant,
  GrantRequest
} from '../types'
import { post } from './requests'

export interface GrantRouteDeps extends RouteDeps {
  client: string
}

interface RequestGrantArgs {
  url: string
  request: Omit<GrantRequest, 'client'>
}

export interface GrantRoutes {
  request(
    args: RequestGrantArgs
  ): Promise<InteractiveGrant | NonInteractiveGrant>
}

export const createGrantRoutes = (deps: GrantRouteDeps): GrantRoutes => {
  const requestGrantValidator = deps.openApi.createResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >({
    path: getASPath('/'),
    method: HttpMethod.POST
  })
  return {
    request: (args: RequestGrantArgs) =>
      post(
        deps,
        {
          url: args.url,
          body: {
            ...args.request,
            client: deps.client
          }
        },
        requestGrantValidator
      )
  }
}
