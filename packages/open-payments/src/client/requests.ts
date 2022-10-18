import axios, { AxiosInstance } from 'axios'
import { ValidateFunction } from 'openapi'
import { CreateOpenPaymentClientArgs } from '.'
import config from '../config'

export interface GetArgs {
  url: string
  accessToken?: string
}

export const get = async <T>(
  axios: AxiosInstance,
  args: GetArgs,
  responseValidator: ValidateFunction<T>
): Promise<T> => {
  const { url, accessToken } = args

  try {
    const { data } = await axios.get(url, {
      headers: accessToken
        ? {
            Authorization: `GNAP ${accessToken}`,
            Signature: 'TODO',
            'Signature-Input': 'TODO'
          }
        : {}
    })

    if (!responseValidator(data)) {
      const errorMessage = 'Failed to validate OpenApi response'
      console.log(errorMessage, {
        url,
        data: JSON.stringify(data)
      })

      throw new Error(errorMessage)
    }

    return data
  } catch (error) {
    console.log('Error when making Open Payments GET request', {
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
