import { HttpMethod, ResponseValidator } from '@interledger/openapi'
import { AccessAction, AccessItem } from '@interledger/open-payments'
import { BaseDeps, RouteDeps } from '.'
import { IntrospectArgs, TokenInfo, isActiveTokenInfo } from '../types'

export interface IntrospectionRoutes {
  introspect(args: IntrospectArgs): Promise<TokenInfo>
}

export const createIntrospectionRoutes = (
  deps: RouteDeps
): IntrospectionRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const introspectOpenApiValidator = openApi.createResponseValidator<TokenInfo>(
    {
      path: '/',
      method: HttpMethod.POST
    }
  )

  return {
    introspect: (args: IntrospectArgs) =>
      introspectToken(
        { axiosInstance, logger },
        args,
        introspectOpenApiValidator
      )
  }
}

export const introspectToken = async (
  deps: BaseDeps,
  args: IntrospectArgs,
  validateOpenApiResponse: ResponseValidator<TokenInfo>
) => {
  const { axiosInstance, logger } = deps

  try {
    const { data, status } = await axiosInstance.request<TokenInfo>({
      data: args
    })

    try {
      validateOpenApiResponse({
        status,
        body: data
      })
    } catch (error) {
      const errorMessage = 'Failed to validate OpenApi response'
      logger.error(
        {
          data: JSON.stringify(data),
          validationError: error instanceof Error && error.message
        },
        errorMessage
      )

      throw new Error(errorMessage)
    }

    return data
  } catch (error) {
    const errorMessage = `Error when making introspection request: ${
      error instanceof Error && error.message ? error.message : 'Unknown error'
    }`
    logger.error({ args }, errorMessage)

    throw new Error(errorMessage)
  }
}

interface Access {
  type: string
  actions: AccessAction[]
  identifier?: string
}

interface RequestAccessItem {
  type: string
  action: AccessAction
  identifier?: string
}

export const findAccessInToken = (
  tokenInfo: TokenInfo,
  access: RequestAccessItem
): AccessItem | undefined => {
  return tokenInfo.access?.find((tokenAccess: Access) => {
    if (
      tokenAccess.type !== access.type ||
      (tokenAccess.identifier && tokenAccess.identifier !== access.identifier)
    ) {
      return false
    }
    if (
      access.action === AccessAction.Read &&
      tokenAccess.actions.includes(AccessAction.ReadAll)
    ) {
      return true
    }
    if (
      access.action === AccessAction.List &&
      tokenAccess.actions.includes(AccessAction.ListAll)
    ) {
      return true
    }
    return tokenAccess.actions.find((tokenAction: AccessAction) => {
      if (isActiveTokenInfo(tokenInfo) && tokenAction === access.action) {
        return true
      }
      return false
    })
  })
}
