import assert from 'assert'
import axios from 'axios'
import { Logger } from 'pino'
import { IncomingPaymentJSON } from '../../open_payments/payment/incoming/model'
import { PaymentError } from '@interledger/pay'

import { OpenAPI, HttpMethod, ValidateFunction } from 'openapi'

export interface SetupPaymentService {
  queryIncomingPayment(
    url: string,
    token: string
  ): Promise<IncomingPaymentJSON | PaymentError>
}

interface ServiceDependencies {
  authServerIntrospectionUrl: string
  authOpenApi: OpenAPI
  logger: Logger
  validateResponse: ValidateFunction<IncomingPaymentJSON>
}

export async function createSetupPaymentService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<SetupPaymentService> {
  const log = deps_.logger.child({
    service: 'SetupPaymentService'
  })
  const validateResponse = deps_.authOpenApi.createResponseValidator<IncomingPaymentJSON>(
    {
      path: '/{accountId}/incoming-payments/{incomingPaymentId}',
      method: HttpMethod.POST
    }
  )
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log,
    validateResponse
  }

  const createHttpUrl = (rawUrl: string, base?: string): URL | undefined => {
    try {
      const url = new URL(rawUrl, base)
      if (url.protocol === 'https:' || url.protocol === 'http:') {
        return url
      }
    } catch (_) {
      return
    }
  }

  const queryIncomingPayment = async (
    url: string,
    token: string
  ): Promise<IncomingPaymentJSON | PaymentError> => {
    if (!createHttpUrl(url)) {
      console.log('destinationPayment query failed: URL not HTTP/HTTPS.')
      return PaymentError.QueryFailed
    }
    const requestHeaders = {
      Authorization: `GNAP ${token}`,
      'Content-Type': 'application/json'
      // TODO:
      // 'Signature-Input': 'sig1=...'
      // 'Signature': 'sig1=...'
      // 'Digest': 'sha256=...'
    }

    const { status, data } = await axios.post(
      url,
      {},
      {
        headers: requestHeaders,
        validateStatus: (status) => status === 200
      }
    )

    assert.ok(
      deps.validateResponse({
        status,
        body: data
      })
    )
    if (!data.ilpStreamConnection.id) {
      return PaymentError.QueryFailed
    }
    return data
  }

  return {
    queryIncomingPayment
  }
}
