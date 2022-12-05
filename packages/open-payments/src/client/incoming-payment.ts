import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import { IncomingPayment, getRSPath, CreateIncomingPaymentArgs } from '../types'
import { get, post } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

interface PostArgs<T> {
  url: string
  body: T
  accessToken: string
}

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
  create(args: PostArgs<CreateIncomingPaymentArgs>): Promise<IncomingPayment>
}

export const createIncomingPaymentRoutes = (
  deps: RouteDeps
): IncomingPaymentRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getIncomingPaymentOpenApiValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getRSPath('/incoming-payments/{id}'),
      method: HttpMethod.GET
    })

  const createIncomingPaymentOpenApiValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getRSPath('/incoming-payments'),
      method: HttpMethod.POST
    })

  return {
    get: (args: GetArgs) =>
      getIncomingPayment(
        { axiosInstance, logger },
        args,
        getIncomingPaymentOpenApiValidator
      ),
    create: (args: PostArgs<CreateIncomingPaymentArgs>) =>
      createIncomingPayment(
        { axiosInstance, logger },
        args,
        createIncomingPaymentOpenApiValidator
      )
  }
}

export const getIncomingPayment = async (
  deps: BaseDeps,
  args: GetArgs,
  validateOpenApiResponse: ResponseValidator<IncomingPayment>
) => {
  const { axiosInstance, logger } = deps
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

export const createIncomingPayment = async (
  deps: BaseDeps,
  args: PostArgs<CreateIncomingPaymentArgs>,
  validateOpenApiResponse: ResponseValidator<IncomingPayment>
) => {
  const { axiosInstance, logger } = deps
  const { url } = args

  const incomingPayment = await post(
    { axiosInstance, logger },
    args,
    validateOpenApiResponse
  )

  try {
    return validateIncomingPayment(incomingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate incoming Payment'
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

  if (
    payment.ilpStreamConnection.assetCode !==
      payment.receivedAmount.assetCode ||
    payment.ilpStreamConnection.assetScale !== payment.receivedAmount.assetScale
  ) {
    throw new Error(
      'Stream connection asset information does not match incoming payment asset information'
    )
  }

  return payment
}
