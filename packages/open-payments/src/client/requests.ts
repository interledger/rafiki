import axios, { AxiosInstance } from 'axios'
import { ValidateFunction } from 'openapi'
import { ClientDeps } from '.'

interface GetArgs {
  url: string
  accessToken?: string
}

export const get = async <T>(
  clientDeps: Pick<ClientDeps, 'axiosInstance' | 'logger'>,
  args: GetArgs,
  validateOpenApiResponse: ValidateFunction<T>
): Promise<T> => {
  const { axiosInstance, logger } = clientDeps
  const { accessToken } = args

  const requestUrl = new URL(args.url)
  if (process.env.NODE_ENV === 'development') {
    requestUrl.protocol = 'http'
  }

  const url = requestUrl.href

  try {
    const { data, status } = await axiosInstance.get(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`,
            Signature: 'TODO',
            'Signature-Input': 'TODO'
          }
        : {}
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
          url,
          validationError: error?.message
        },
        errorMessage
      )

      throw new Error(errorMessage)
    }

    return data
  } catch (error) {
    const errorMessage = `Error when making Open Payments GET request: ${
      error?.message ? error.message : 'Unknown error'
    }`
    logger.error({ url }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const createAxiosInstance = (args: {
  requestTimeoutMs: number
}): AxiosInstance => {
  const axiosInstance = axios.create({
    timeout: args.requestTimeoutMs
  })

  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  return axiosInstance
}
