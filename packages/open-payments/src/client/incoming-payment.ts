import { HttpMethod, ResponseValidator } from 'openapi'
import { ClientDeps } from '.'
import { IncomingPayment, getPath } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
}

export const createIncomingPaymentRoutes = (
  clientDeps: ClientDeps
): IncomingPaymentRoutes => {
  const { axiosInstance, openApi, logger } = clientDeps

  const getIncomingPaymentOpenApiValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      getIncomingPayment(
        { axiosInstance, logger },
        args,
        getIncomingPaymentOpenApiValidator
      )
  }
}

export const getIncomingPayment = async (
  clientDeps: Pick<ClientDeps, 'axiosInstance' | 'logger'>,
  args: GetArgs,
  validateOpenApiResponse: ResponseValidator<IncomingPayment>
) => {
  const { axiosInstance, logger } = clientDeps
  const { url } = args

  const incomingPayment = await get(
    { axiosInstance, logger },
    args,
    validateOpenApiResponse
  )

  try {
    return validateIncomingPayment(incomingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate incoming payment'
    logger.error({ url, validateError: error?.message }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const validateIncomingPayment = (
  payment: IncomingPayment
): IncomingPayment => {
  if (payment.incomingAmount) {
    const { incomingAmount, receivedAmount } = payment
    if (
      incomingAmount.assetCode !== receivedAmount.assetCode ||
      incomingAmount.assetScale !== receivedAmount.assetScale
    ) {
      throw new Error(
        'Incoming amount asset code or asset scale does not match up received amount'
      )
    }
    if (BigInt(incomingAmount.value) < BigInt(receivedAmount.value)) {
      throw new Error('Received amount is larger than incoming amount')
    }
    if (incomingAmount.value === receivedAmount.value && !payment.completed) {
      throw new Error(
        'Incoming amount matches received amount but payment is not completed'
      )
    }
  }
  if (typeof payment.ilpStreamConnection === 'object') {
    if (
      payment.ilpStreamConnection.assetCode !==
        payment.receivedAmount.assetCode ||
      payment.ilpStreamConnection.assetScale !==
        payment.receivedAmount.assetScale
    ) {
      throw new Error(
        'Stream connection asset information does not match incoming payment asset information'
      )
    }
  }

  return payment
}
