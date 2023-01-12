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

interface RequestWithUrlArgs {
  url: string
  accessToken: string
}

interface RequestWithPaymentPointerArgs {
  paymentPointer: string
  accessToken: string
}

export interface OutgoingPaymentRoutes {
  get(args: RequestWithUrlArgs): Promise<OutgoingPayment>
  list(
    args: RequestWithPaymentPointerArgs,
    pagination?: PaginationArgs
  ): Promise<OutgoingPaymentPaginationResult>
  create(
    requestArgs: RequestWithPaymentPointerArgs,
    createArgs: CreateOutgoingPaymentArgs
  ): Promise<OutgoingPayment>
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
    get: (requestArgs: RequestWithUrlArgs) =>
      getOutgoingPayment(
        { axiosInstance, logger },
        requestArgs,
        getOutgoingPaymentOpenApiValidator
      ),
    list: (
      requestArgs: RequestWithPaymentPointerArgs,
      pagination?: PaginationArgs
    ) =>
      listOutgoingPayments(
        { axiosInstance, logger },
        requestArgs,
        listOutgoingPaymentOpenApiValidator,
        pagination
      ),
    create: (
      requestArgs: RequestWithPaymentPointerArgs,
      createArgs: CreateOutgoingPaymentArgs
    ) =>
      createOutgoingPayment(
        { axiosInstance, logger },
        requestArgs,
        createOutgoingPaymentOpenApiValidator,
        createArgs
      )
  }
}

export const getOutgoingPayment = async (
  deps: BaseDeps,
  requestArgs: RequestWithUrlArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPayment>
) => {
  const { axiosInstance, logger } = deps
  const { url, accessToken } = requestArgs

  const outgoingPayment = await get(
    { axiosInstance, logger },
    { url, accessToken },
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

export const createOutgoingPayment = async (
  deps: BaseDeps,
  requestArgs: RequestWithPaymentPointerArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPayment>,
  createArgs: CreateOutgoingPaymentArgs
) => {
  const { axiosInstance, logger } = deps
  const { paymentPointer, accessToken } = requestArgs
  const url = `${paymentPointer}${getRSPath('/outgoing-payments')}`

  const outgoingPayment = await post(
    { axiosInstance, logger },
    { url, body: createArgs, accessToken },
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

export const listOutgoingPayments = async (
  deps: BaseDeps,
  requestArgs: RequestWithPaymentPointerArgs,
  validateOpenApiResponse: ResponseValidator<OutgoingPaymentPaginationResult>,
  pagination?: PaginationArgs
) => {
  const { axiosInstance, logger } = deps
  const { accessToken, paymentPointer } = requestArgs
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
          validateError: error?.message,
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
