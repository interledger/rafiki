import axios, { AxiosInstance } from 'axios'
import { ValidateFunction } from 'openapi'
import { ClientDeps, CreateOpenPaymentClientArgs } from '.'
import config from '../config'

export interface GetArgs {
  url: string
  accessToken?: string
}

export const get = async <T>(
  clientDeps: Pick<ClientDeps, 'axiosInstance' | 'logger'>,
  args: GetArgs,
  openApiResponseValidator: ValidateFunction<T>
): Promise<T> => {
  const { axiosInstance, logger } = clientDeps
  const { url, accessToken } = args

  try {
    const { data } = await axiosInstance.get(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`,
            Signature: 'TODO',
            'Signature-Input': 'TODO'
          }
        : {}
    })

    if (!openApiResponseValidator(data)) {
      const errorMessage = 'Failed to validate OpenApi response'
      logger.error(errorMessage, {
        url,
        data: JSON.stringify(data)
      })

      throw new Error(errorMessage)
    }

    return data
  } catch (error) {
    logger.error('Error when making Open Payments GET request', {
      errorMessage: error?.message,
      url
    })

    throw error
  }
}

export const createAxiosInstance = (
  args?: CreateOpenPaymentClientArgs
): AxiosInstance => {
  const axiosInstance = axios.create({
    timeout: args?.timeout ?? config.DEFAULT_REQUEST_TIMEOUT
  })

  axiosInstance.defaults.headers.common['Content-Type'] = 'application/json'

  return axiosInstance
}
