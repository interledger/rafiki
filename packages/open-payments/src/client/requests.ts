import axios, { AxiosInstance } from 'axios'
import { KeyLike } from 'crypto'
import { ResponseValidator } from 'openapi'
import { ClientDeps } from '.'
import { createSignatureHeaders } from './signatures'

interface GetArgs {
  url: string
  accessToken?: string
}

export const get = async <T>(
  clientDeps: Pick<ClientDeps, 'axiosInstance' | 'logger'>,
  args: GetArgs,
  openApiResponseValidator: ResponseValidator<T>
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
    const errorMessage = `Error when making Open Payments GET request: ${
      error?.message ? error.message : 'Unknown error'
    }`
    logger.error({ url }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const createAxiosInstance = (args: {
  requestTimeoutMs: number
  privateKey: KeyLike
  keyId: string
}): AxiosInstance => {
  const axiosInstance = axios.create({
    timeout: args.requestTimeoutMs
  })
  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  axiosInstance.interceptors.request.use(
    async (config) => {
      const sigHeaders = await createSignatureHeaders({
        request: {
          method: config.method.toUpperCase(),
          url: config.url,
          // https://github.com/axios/axios/issues/5089#issuecomment-1297761617
          headers: JSON.parse(JSON.stringify(config.headers)),
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
      runWhen: (config) => !!config.headers['Authorization']
    }
  )

  return axiosInstance
}
