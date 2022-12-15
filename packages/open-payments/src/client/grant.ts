import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import {
  getASPath,
  InteractiveGrant,
  NonInteractiveGrant,
  GrantRequest,
  GrantContinuationRequest
} from '../types'
import { post } from './requests'

export interface GrantRouteDeps extends RouteDeps {
  client: string
}

interface RequestGrantArgs {
  url: string
  request: Omit<GrantRequest, 'client'>
}

interface ContinuationRequestArgs {
  url: string
  request: GrantContinuationRequest
}

export interface GrantRoutes {
  request(
    args: RequestGrantArgs
  ): Promise<InteractiveGrant | NonInteractiveGrant>
  continue(args: ContinuationRequestArgs): Promise<NonInteractiveGrant>
}

export const createGrantRoutes = (deps: GrantRouteDeps): GrantRoutes => {
  const requestGrantValidator = deps.openApi.createResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >({
    path: getASPath('/'),
    method: HttpMethod.POST
  })
  const continueGrantValidator =
    deps.openApi.createResponseValidator<NonInteractiveGrant>({
      path: getASPath('/continue/{id}'),
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
      ),
    continue: (args: ContinuationRequestArgs) =>
      post(
        deps,
        {
          url: args.url,
          body: {
            ...args.request
          }
        },
        continueGrantValidator
      )
  }
}
