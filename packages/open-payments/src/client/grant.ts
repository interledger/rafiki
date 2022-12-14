import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import {
  getASPath,
  InteractiveGrant,
  NonInteractiveGrant,
  GrantRequest,
  GrantContinuationRequest
} from '../types'
import { post, deleteRequest } from './requests'

export interface GrantRouteDeps extends RouteDeps {
  client: string
}

interface PostArgs {
  url: string
  accessToken: string
}

export interface GrantRoutes {
  request(
    postArgs: Omit<PostArgs, 'accessToken'>,
    args: Omit<GrantRequest, 'client'>
  ): Promise<InteractiveGrant | NonInteractiveGrant>
  continue(
    postArgs: PostArgs,
    args: GrantContinuationRequest
  ): Promise<NonInteractiveGrant>
  cancel(postArgs: PostArgs): Promise<void>
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
  const cancelGrantValidator = deps.openApi.createResponseValidator({
    path: getASPath('/continue/{id}'),
    method: HttpMethod.DELETE
  })

  return {
    request: (
      { url }: Omit<PostArgs, 'accessToken'>,
      args: Omit<GrantRequest, 'client'>
    ) =>
      post(
        deps,
        {
          url,
          body: {
            ...args,
            client: deps.client
          }
        },
        requestGrantValidator
      ),
    continue: (
      { url, accessToken }: PostArgs,
      args: GrantContinuationRequest
    ) =>
      post(
        deps,
        {
          url,
          accessToken,
          body: {
            ...args
          }
        },
        continueGrantValidator
      ),
    cancel: ({ url, accessToken }: PostArgs) =>
      deleteRequest(
        deps,
        {
          url,
          accessToken
        },
        cancelGrantValidator
      )
  }
}
