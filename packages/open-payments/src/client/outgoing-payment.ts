import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import { getRSPath, OutgoingPayment } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

export interface OutgoingPaymentRoutes {
  get(args: GetArgs): Promise<OutgoingPayment>
}

export const createOutgoingPaymentRoutes = (
  deps: RouteDeps
): OutgoingPaymentRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getOutgoingPaymentOpenApiValidator =
    openApi.createResponseValidator<OutgoingPayment>({
      path: getRSPath('/outgoing-payments/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      getOutgoingPayment(
        { axiosInstance, logger },
        args,
        getOutgoingPaymentOpenApiValidator
      )
  }
}

export const getOutgoingPayment = async (
  deps: BaseDeps,
  args: GetArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPayment>
) => {
  const { axiosInstance, logger } = deps
  const { url } = args

  const outgoingPayment = await get(
    { axiosInstance, logger },
    args,
    validateOpenApiResponse
  )

  try {
    return validateOutgoingPayment(outgoingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate outgoing payment'
    logger.error({ url, validateError: error?.message }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const validateOutgoingPayment = (
  payment: OutgoingPayment
): OutgoingPayment => {
  const { sendAmount, sentAmount } = payment
  if (
    sendAmount.assetCode !== sentAmount.assetCode ||
    sendAmount.assetScale !== sentAmount.assetScale
  ) {
    throw new Error(
      'Asset code or asset scale of sending amount does not match up sent amount'
    )
  }
  if (BigInt(sendAmount.value) < BigInt(sentAmount.value)) {
    throw new Error('Amount sent is larger than maximum amount to send')
  }
  if (sendAmount.value === sentAmount.value && payment.failed) {
    throw new Error('Amount to send matches sent amount but payment failed')
  }

  return payment
}
