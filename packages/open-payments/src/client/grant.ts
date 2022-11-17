import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import {
  getASPath,
  InteractiveGrant,
  NonInteractiveGrant,
  GrantRequest
} from '../types'
import { post } from './requests'

interface RequestGrantArgs {
  url: string
  request: GrantRequest
}

export interface GrantRoutes {
  requestGrant(
    args: RequestGrantArgs
  ): Promise<InteractiveGrant | NonInteractiveGrant>
}

export const createGrantRoutes = (deps: RouteDeps): GrantRoutes => {
  const requestGrantValidator = deps.openApi.createResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >({
    path: getASPath('/'),
    method: HttpMethod.POST
  })
  return {
    requestGrant: (args: RequestGrantArgs) =>
      post(deps, { url: args.url, body: args.request }, requestGrantValidator)
  }
}
