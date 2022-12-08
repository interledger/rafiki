import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import { IncomingPayment, getRSPath, CreateIncomingPaymentArgs } from '../types'
import { get, post } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

interface PostArgs<T = undefined> {
  url: string
  body?: T
  accessToken: string
}

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
  create(args: PostArgs<CreateIncomingPaymentArgs>): Promise<IncomingPayment>
  complete(args: PostArgs): Promise<IncomingPayment>
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

  const completeIncomingPaymentOpenApiValidator =
    openApi.createResponseValidator<IncomingPayment>({
      path: getRSPath('/incoming-payments/{id}/complete'),
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
      ),
    complete: (args: PostArgs) =>
      completeIncomingPayment(
        { axiosInstance, logger },
        args,
        completeIncomingPaymentOpenApiValidator
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
    return validateCreatedIncomingPayment(incomingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate incoming Payment'
    logger.error({ url, validateError: error?.message }, errorMessage)

    throw new Error(errorMessage)
  }
}

export const completeIncomingPayment = async (
  deps: BaseDeps,
  args: PostArgs,
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
    return validateCompletedIncomingPayment(incomingPayment)
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

export const validateCreatedIncomingPayment = (
  payment: IncomingPayment
): IncomingPayment => {
  const { receivedAmount, completed } = payment

  if (BigInt(receivedAmount.value) !== BigInt(0)) {
    throw new Error('Received amount is a non-zero value.')
  }

  if (completed === true) {
    throw new Error('Can not create a completed incoming payment.')
  }

  return validateIncomingPayment(payment)
}

export const validateCompletedIncomingPayment = (
  payment: IncomingPayment
): IncomingPayment => {
  const { completed, expiresAt } = payment

  if (new Date(expiresAt).getTime() <= Date.now()) {
    throw new Error('Can not complete an expired incoming payment.')
  }

  if (completed === false) {
    throw new Error('Incoming payment could not be completed.')
  }

  return validateIncomingPayment(payment)
}
