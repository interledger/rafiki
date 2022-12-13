import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { getASPath, InteractiveGrant, NonInteractiveGrant } from '../types'
import { post } from './requests'

export interface TokenRouteDeps extends RouteDeps {
  client: string
}

interface RotateRequestArgs {
  url: string
}

export interface TokenRoutes {
  rotate(
    args: RotateRequestArgs
  ): Promise<InteractiveGrant | NonInteractiveGrant>
}

export const createTokenRoutes = (deps: TokenRouteDeps): TokenRoutes => {
  const rotateTokenValidator = deps.openApi.createResponseValidator<
    AccessToken
  >({
    path: getASPath('/token/{id}'),
    method: HttpMethod.POST
  })

  return {
    rotate: (args: RotateRequestArgs) =>
      post(
        deps,
        {
          url: args.url,
          body: {
            client: deps.client
          }
        },
        revokeTokenValidator
      )
  }
}
