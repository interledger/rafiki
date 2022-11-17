import { HttpMethod, ResponseValidator } from 'openapi'
import { RouteDeps } from '.'
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

export const createGrantRoutes = (deps: RouteDeps): GrantRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const requestGrantValidator = openApi.createResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >({
    path: getASPath('/'),
    method: HttpMethod.POST
  })
  return {
    requestInteractiveGrant: (
      args: RequestGrantArgs<InteractiveGrantRequest>
    ) =>
      requestInteractiveGrant(
        { axiosInstance, logger },
        args,
        requestGrantValidator
      ),
    requestNonInteractiveGrant: (
      args: RequestGrantArgs<NonInteractiveGrantRequest>
    ) =>
      requestNonInteractiveGrant(
        { axiosInstance, logger },
        args,
        requestGrantValidator
      )
  }
}

export const requestInteractiveGrant = async (
  deps: Pick<RouteDeps, 'axiosInstance' | 'logger'>,
  args: RequestGrantArgs<InteractiveGrantRequest>,
  validateOpenApiResponse: ResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >
) => {
  const { axiosInstance, logger } = deps
  const { url } = args

  const grant = await post(
    { axiosInstance, logger },
    { url: args.url, body: args.request },
    validateOpenApiResponse
  )

  if (!isInteractiveGrant(grant)) {
    const errorMessage = 'Could not validate interactive grant'
    logger.error({ url, grant }, errorMessage)
    throw new Error(errorMessage)
  }

  return grant
}

export const requestNonInteractiveGrant = async (
  deps: Pick<RouteDeps, 'axiosInstance' | 'logger'>,
  args: RequestGrantArgs<NonInteractiveGrantRequest>,
  validateOpenApiResponse: ResponseValidator<
    InteractiveGrant | NonInteractiveGrant
  >
) => {
  const { axiosInstance, logger } = deps
  const { url } = args

  const grant = await post(
    { axiosInstance, logger },
    { url: args.url, body: args.request },
    validateOpenApiResponse
  )

  if (!isNonInteractiveGrant(grant)) {
    const errorMessage = 'Could not validate non-interactive grant'
    logger.error({ url, grant }, errorMessage)
    throw new Error(errorMessage)
  }

  return grant
}

export const isInteractiveGrant = (
  grant: InteractiveGrant | NonInteractiveGrant
): grant is InteractiveGrant =>
  !('access_token' in grant) &&
  'interact' in grant &&
  !!(grant as InteractiveGrant).interact

export const isNonInteractiveGrant = (
  grant: InteractiveGrant | NonInteractiveGrant
): grant is NonInteractiveGrant =>
  !('interact' in grant) &&
  'access_token' in grant &&
  !!(grant as NonInteractiveGrant).access_token
