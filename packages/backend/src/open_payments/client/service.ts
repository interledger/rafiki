import axios from 'axios'
import { OpenAPI, HttpMethod, ValidateFunction } from 'openapi'

import { BaseService } from '../../shared/baseService'
import { IncomingPaymentJSON } from '../payment/incoming/model'

const REQUEST_TIMEOUT = 5_000 // millseconds

export interface OpenPaymentsClientService {
  incomingPayment: {
    get(url: string): Promise<IncomingPaymentJSON | undefined>
  }
}

export interface ServiceDependencies extends BaseService {
  accessToken: string
  openApi: OpenAPI
  validateResponse: ValidateFunction<IncomingPaymentJSON>
}

export async function createOpenPaymentsClientService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<OpenPaymentsClientService> {
  const log = deps_.logger.child({
    service: 'OpenPaymentsClientService'
  })
  const validateResponse =
    deps_.openApi.createResponseValidator<IncomingPaymentJSON>({
      path: '/incoming-payments/{incomingPaymentId}',
      method: HttpMethod.GET
    })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log,
    validateResponse
  }
  return {
    incomingPayment: {
      get: (url) => getIncomingPayment(deps, url)
    }
  }
}

export async function getIncomingPayment(
  deps: ServiceDependencies,
  url: string
): Promise<IncomingPaymentJSON | undefined> {
  const requestHeaders = {
    Authorization: `GNAP ${deps.accessToken}`,
    'Content-Type': 'application/json'
  }
  try {
    const { status, data } = await axios.get(url, {
      headers: requestHeaders,
      timeout: REQUEST_TIMEOUT,
      validateStatus: (status) => status === 200
    })
    if (
      !deps.validateResponse({
        status,
        body: data
      })
    ) {
      throw new Error('unreachable')
    }
    return data
  } catch (_) {
    return undefined
  }
}
