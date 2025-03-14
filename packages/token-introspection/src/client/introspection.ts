import { BaseDeps } from '.'
import { IntrospectArgs, TokenInfo } from '../types'

export interface IntrospectionRoutes {
  introspect(args: IntrospectArgs): Promise<TokenInfo>
}

export const createIntrospectionRoutes = (
  deps: BaseDeps
): IntrospectionRoutes => {
  const { axiosInstance, logger } = deps

  return {
    introspect: (args: IntrospectArgs) =>
      introspectToken({ axiosInstance, logger }, args)
  }
}

export const introspectToken = async (deps: BaseDeps, args: IntrospectArgs) => {
  const { axiosInstance, logger } = deps

  try {
    const { data } = await axiosInstance.request<TokenInfo>({
      data: args
    })

    return data
  } catch (error) {
    const errorMessage = `Error when making introspection request: ${
      error instanceof Error && error.message ? error.message : 'Unknown error'
    }`
    logger.error({ args }, errorMessage)

    throw new Error(errorMessage)
  }
}
