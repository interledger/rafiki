import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import {
  IncomingPayment,
  getRSPath,
  CreateIncomingPaymentArgs,
  PaginationArgs,
  IncomingPaymentPaginationResult
} from '../types'
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

interface ListGetArgs {
  paymentPointer: string
  accessToken: string
}

export interface IncomingPaymentRoutes {
  get(args: GetArgs): Promise<IncomingPayment>
  create(args: PostArgs<CreateIncomingPaymentArgs>): Promise<IncomingPayment>
  complete(args: PostArgs): Promise<IncomingPayment>
  list(
    args: ListGetArgs,
    pagination?: PaginationArgs
  ): Promise<IncomingPaymentPaginationResult>
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

  const listIncomingPaymentOpenApiValidator =
    openApi.createResponseValidator<IncomingPaymentPaginationResult>({
      path: getRSPath('/incoming-payments'),
      method: HttpMethod.GET
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
      ),
    list: (args: ListGetArgs, pagination?: PaginationArgs) =>
      listIncomingPayment(
        { axiosInstance, logger },
        args,
        listIncomingPaymentOpenApiValidator,
        pagination
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

export const listIncomingPayment = async (
  deps: BaseDeps,
  args: ListGetArgs,
  validateOpenApiResponse: ResponseValidator<IncomingPaymentPaginationResult>,
  pagination?: PaginationArgs
) => {
  const { axiosInstance, logger } = deps
  const { accessToken, paymentPointer } = args

  const url = `${paymentPointer}${getRSPath('/incoming-payments')}`

  const incomingPayments = await get(
    { axiosInstance, logger },
    {
      url,
      accessToken,
      ...(pagination ? { queryParams: { ...pagination } } : {})
    },
    validateOpenApiResponse
  )

  for (const incomingPayment of incomingPayments.result) {
    try {
      validateIncomingPayment(incomingPayment)
    } catch (error) {
      const errorMessage = 'Could not validate incoming payment'
      logger.error(
        {
          url,
          validateError: error?.message,
          incomingPaymentId: incomingPayment.id
        },
        errorMessage
      )

      throw new Error(errorMessage)
    }
  }

  return incomingPayments
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
    !payment.ilpStreamConnection ||
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
  const { completed } = payment

  if (completed === false) {
    throw new Error('Incoming payment could not be completed.')
  }

  return validateIncomingPayment(payment)
}
