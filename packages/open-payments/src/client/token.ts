import { HttpMethod, ResponseValidator } from 'openapi'
import { RouteDeps } from '.'
import { getASPath, AccessToken } from '../types'
import { deleteRequest, post } from './requests'

interface TokenRequestArgs {
  url: string
  accessToken: string
}

export interface TokenRoutes {
  rotate(args: TokenRequestArgs): Promise<AccessToken>
  revoke(args: TokenRequestArgs): Promise<void>
}

export const rotateToken = async (
  deps: RouteDeps,
  args: TokenRequestArgs,
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

export const revokeToken = async (
  deps: RouteDeps,
  args: TokenRequestArgs,
  validateOpenApiResponse: ResponseValidator<void>
) => {
  const { axiosInstance, logger } = deps
  const { url, accessToken } = args

  return deleteRequest(
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

  const revokeTokenValidator = deps.openApi.createResponseValidator<void>({
    path: getASPath('/token/{id}'),
    method: HttpMethod.DELETE
  })

  return {
    rotate: (args: TokenRequestArgs) =>
      rotateToken(deps, args, rotateTokenValidator),
    revoke: (args: TokenRequestArgs) =>
      revokeToken(deps, args, revokeTokenValidator)
  }
}
