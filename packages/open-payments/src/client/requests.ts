import axios, { AxiosInstance } from 'axios'
import { KeyLike } from 'crypto'
import { createContentDigestHeader } from 'httpbis-digest-headers'
import { ResponseValidator } from 'openapi'
import { BaseDeps } from '.'
import { createSignatureHeaders } from './signatures'

interface GetArgs {
  url: string
  queryParams?: Record<string, unknown>
  accessToken?: string
}
interface PostArgs<T> {
  url: string
  body: T
  accessToken?: string
}

export const get = async <T>(
  deps: BaseDeps,
  args: GetArgs,
  openApiResponseValidator: ResponseValidator<T>
): Promise<T> => {
  const { axiosInstance, logger } = deps
  const { accessToken, queryParams } = args


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
      params:
        queryParams && Object.keys(queryParams).length > 0
          ? args.queryParams
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
        if (config.data) {
          const data = JSON.stringify(config.data)
          config.headers['Content-Digest'] = createContentDigestHeader(data, [
            'sha-512'
          ])
          config.headers['Content-Length'] = Buffer.from(data, 'utf-8').length
          config.headers['Content-Type'] = 'application/json'
        }
        const sigHeaders = await createSignatureHeaders({
          request: {
            method: config.method.toUpperCase(),
            url: config.url,
            headers: config.headers,
            body: config.data
          },
          privateKey: args.privateKey,
          keyId: args.keyId
        })
        config.headers['Signature'] = sigHeaders['Signature']
        config.headers['Signature-Input'] = sigHeaders['Signature-Input']
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
