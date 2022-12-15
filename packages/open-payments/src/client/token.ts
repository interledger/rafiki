import { HttpMethod, ResponseValidator } from 'openapi'
import { RouteDeps } from '.'
import { getASPath, AccessToken } from '../types'
import { post } from './requests'

interface RotateRequestArgs {
  url: string
  accessToken: string
}

export interface TokenRoutes {
  rotate(args: RotateRequestArgs): Promise<AccessToken>
}

export const rotateToken = async (
  deps: RouteDeps,
  args: RotateRequestArgs,
  validateOpenApiResponse: ResponseValidator<AccessToken>
) => {
  const { axiosInstance, logger } = deps
  const { url, accessToken } = args

  return post(
    {
      axiosInstance,
      logger
    },
    {
      url,
      accessToken
    },
    validateOpenApiResponse
  )
}

export const createTokenRoutes = (deps: RouteDeps): TokenRoutes => {
  const rotateTokenValidator =
    deps.openApi.createResponseValidator<AccessToken>({
      path: getASPath('/token/{id}'),
      method: HttpMethod.POST
    })

  return {
    rotate: (args: RotateRequestArgs) =>
      rotateToken(deps, args, rotateTokenValidator)
  }
}
