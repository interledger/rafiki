import assert from 'assert'
import axios from 'axios'
import { Logger } from 'pino'
import {
  IncomingPaymentJSON,
  IlpStreamConnectionJSON
} from '../../open_payments/payment/incoming/model'
import { PaymentError } from '@interledger/pay'
import { IlpPlugin } from '../../shared/ilp_plugin'
import * as Pay from '@interledger/pay'

import { OpenAPI, HttpMethod, ValidateFunction } from 'openapi'

export interface SetupPaymentService {
  queryIncomingPayment(
    url: string,
    token: string
  ): Promise<IncomingPaymentJSON | PaymentError>
  setupPayment(destinationPayment: string, gnapToken: string, plugin: IlpPlugin)
}

interface ServiceDependencies {
  openApi: OpenAPI
  logger: Logger
  validateResponse: ValidateFunction<IncomingPaymentJSON>
}

export async function createSetupPaymentService(
  deps_: Omit<ServiceDependencies, 'validateResponse'>
): Promise<SetupPaymentService> {
  const log = deps_.logger.child({
    service: 'SetupPaymentService'
  })
  const validateResponse = deps_.openApi.createResponseValidator<IncomingPaymentJSON>(
    {
      path: '/{accountId}/incoming-payments/{incomingPaymentId}',
      method: HttpMethod.GET
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

  const setupPayment = async (
    incomingPaymentUrl: string,
    gnapToken: string,
    plugin: IlpPlugin
  ): Promise<Pay.ResolvedPayment> => {
    const incomingPayment = await queryIncomingPayment(
      incomingPaymentUrl,
      gnapToken
    )
    return await Pay.setupPayment({
      plugin,
      destinationAddress: (incomingPayment.ilpStreamConnection as IlpStreamConnectionJSON)
        .ilpAddress,
      sharedSecret: Buffer.from(
        (incomingPayment.ilpStreamConnection as IlpStreamConnectionJSON)
          .sharedSecret,
        'base64'
      )
    })
  }

  const queryIncomingPayment = async (
    url: string,
    token: string
  ): Promise<IncomingPaymentJSON> => {
    if (!createHttpUrl(url)) {
      console.log('destinationPayment query failed: URL not HTTP/HTTPS.')
      throw new Error(PaymentError.QueryFailed)
    }
    const requestHeaders = {
      Authorization: `GNAP ${token}`,
      'Content-Type': 'application/json'
    }

    const { status, data } = await axios.get(url, {
      headers: requestHeaders,
      validateStatus: (status) => status === 200
    })

    try {
      assert.ok(
        deps.validateResponse({
          status,
          body: data
        })
      )
    } catch (_) {
      throw new Error(PaymentError.QueryFailed)
    }
    // GET requests to the Incoming Payment should always
    // return an ilpConnectionStream object that has
    // an `id` attribute. but for list requests,
    // the ilpStreamConnection attribute can be a string.
    // This checks to make sure we've gotten the right kind
    // of response.
    if (data.ilpStreamConnection !== Object(data.ilpStreamConnection)) {
      throw new Error(PaymentError.QueryFailed)
    }
    return data
  }

  return {
    queryIncomingPayment,
    setupPayment
  }
}
