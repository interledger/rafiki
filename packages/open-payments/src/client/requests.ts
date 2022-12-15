import axios, { AxiosInstance } from 'axios'
import { KeyLike } from 'crypto'
import { ResponseValidator } from 'openapi'
import { BaseDeps } from '.'
import { createHeaders } from 'http-signature-utils'

interface GetArgs {
  url: string
  queryParams?: Record<string, unknown>
  accessToken?: string
}

interface PostArgs<T = undefined> {
  url: string
  body?: T
  accessToken?: string
}

const removeEmptyValues = (obj: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(obj).filter(([_, v]) => v != null))

export const get = async <T>(
  deps: BaseDeps,
  args: GetArgs,
  openApiResponseValidator: ResponseValidator<T>
): Promise<T> => {
  const { axiosInstance, logger } = deps
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
            Authorization: `GNAP ${accessToken}`
          }
        : {},
      params: args.queryParams ? removeEmptyValues(args.queryParams) : undefined
    })

    try {
      openApiResponseValidator({
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

export const post = async <TRequest, TResponse>(
  deps: BaseDeps,
  args: PostArgs<TRequest>,
  openApiResponseValidator: ResponseValidator<TResponse>
): Promise<TResponse> => {
  const { axiosInstance, logger } = deps
  const { body, accessToken } = args

  const requestUrl = new URL(args.url)
  if (process.env.NODE_ENV === 'development') {
    requestUrl.protocol = 'http'
  }

  const url = requestUrl.href

  try {
    const { data, status } = await axiosInstance.post<TResponse>(url, body, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`
          }
        : {}
    })

    try {
      openApiResponseValidator({
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
    const errorMessage = `Error when making Open Payments POST request: ${
      error?.message ? error.message : 'Unknown error'
    }`
    logger.error({ url }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const createAxiosInstance = (args: {
  requestTimeoutMs: number
  privateKey?: KeyLike
  keyId?: string
}): AxiosInstance => {
  const axiosInstance = axios.create({
    timeout: args.requestTimeoutMs
  })
  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  if (args.privateKey && args.keyId) {
    axiosInstance.interceptors.request.use(
      async (config) => {
        const contentAndSigHeaders = await createHeaders({
          request: {
            method: config.method.toUpperCase(),
            url: config.url,
            headers: config.headers,
            body: config.data ? JSON.stringify(config.data) : undefined
          },
          privateKey: args.privateKey,
          keyId: args.keyId
        })
        if (config.data) {
          config.headers['Content-Digest'] =
            contentAndSigHeaders['Content-Digest']
          config.headers['Content-Length'] =
            contentAndSigHeaders['Content-Length']
          config.headers['Content-Type'] = contentAndSigHeaders['Content-Type']
        }
        config.headers['Signature'] = contentAndSigHeaders['Signature']
        config.headers['Signature-Input'] =
          contentAndSigHeaders['Signature-Input']
        return config
      },
      null,
      {
        runWhen: (config) =>
          config.method.toLowerCase() === 'post' ||
          !!config.headers['Authorization']
      }
    )
  }

  return axiosInstance
}
