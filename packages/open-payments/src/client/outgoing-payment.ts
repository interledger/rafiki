import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import {
  CreateOutgoingPaymentArgs,
  getRSPath,
  OutgoingPayment,
  OutgoingPaymentPaginationResult,
  PaginationArgs
} from '../types'
import { get, post } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

interface ListGetArgs {
  paymentPointer: string
  accessToken: string
}

interface PostArgs<T> {
  url: string
  body: T
  accessToken: string
}

export interface OutgoingPaymentRoutes {
  get(args: GetArgs): Promise<OutgoingPayment>
  list(
    args: ListGetArgs,
    pagination?: PaginationArgs
  ): Promise<OutgoingPaymentPaginationResult>
  create(args: PostArgs<CreateOutgoingPaymentArgs>): Promise<OutgoingPayment>
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

  const listOutgoingPaymentOpenApiValidator =
    openApi.createResponseValidator<OutgoingPaymentPaginationResult>({
      path: getRSPath('/outgoing-payments'),
      method: HttpMethod.GET
    })

  const createOutgoingPaymentOpenApiValidator =
    openApi.createResponseValidator<OutgoingPayment>({
      path: getRSPath('/outgoing-payments'),
      method: HttpMethod.POST
    })

  return {
    get: (args: GetArgs) =>
      getOutgoingPayment(
        { axiosInstance, logger },
        args,
        getOutgoingPaymentOpenApiValidator
      ),
    list: (getArgs: ListGetArgs, pagination?: PaginationArgs) =>
      listOutgoingPayments(
        { axiosInstance, logger },
        getArgs,
        listOutgoingPaymentOpenApiValidator,
        pagination
      ),
    create: (args: PostArgs<CreateOutgoingPaymentArgs>) =>
      createOutgoingPayment(
        { axiosInstance, logger },
        args,
        createOutgoingPaymentOpenApiValidator
      )
  }
}

export const getOutgoingPayment = async (
  deps: BaseDeps,
  args: GetArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPayment>
) => {
  const { axiosInstance, logger } = deps
  const { url, accessToken } = args

  const outgoingPayment = await get(
    { axiosInstance, logger },
    { url, accessToken },
    validateOpenApiResponse
  )

  try {
    return validateOutgoingPayment(outgoingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate outgoing payment'
    logger.error(
      { url, validateError: error && error['message'] },
      errorMessage
    )

    throw new Error(errorMessage)
  }
}

export const createOutgoingPayment = async (
  deps: BaseDeps,
  args: PostArgs<CreateOutgoingPaymentArgs>,
  validateOpenApiResponse: ResponseValidator<OutgoingPayment>
) => {
  const { axiosInstance, logger } = deps
  const { url, body, accessToken } = args

  const outgoingPayment = await post(
    { axiosInstance, logger },
    { url, body, accessToken },
    validateOpenApiResponse
  )

  try {
    return validateOutgoingPayment(outgoingPayment)
  } catch (error) {
    const errorMessage = 'Could not validate outgoing payment'
    logger.error(
      { url, validateError: error && error['message'] },
      errorMessage
    )

    throw new Error(errorMessage)
  }
}

export const listOutgoingPayments = async (
  deps: BaseDeps,
  getArgs: ListGetArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPaymentPaginationResult>,
  pagination?: PaginationArgs
) => {
  const { axiosInstance, logger } = deps
  const { accessToken, paymentPointer } = getArgs
  const url = `${paymentPointer}${getRSPath('/outgoing-payments')}`

  const outgoingPayments = await get(
    { axiosInstance, logger },
    {
      url,
      accessToken,
      ...(pagination ? { queryParams: { ...pagination } } : {})
    },
    validateOpenApiResponse
  )

  for (const outgoingPayment of outgoingPayments.result) {
    try {
      validateOutgoingPayment(outgoingPayment)
    } catch (error) {
      const errorMessage = 'Could not validate outgoing payment'
      logger.error(
        {
          url,
          validateError: error && error['message'],
          outgoingPaymentId: outgoingPayment.id
        },
        errorMessage
      )

      throw new Error(errorMessage)
    }
  }

  return outgoingPayments
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
      'Asset code or asset scale of sending amount does not match sent amount'
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
