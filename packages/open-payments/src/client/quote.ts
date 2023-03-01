import { HttpMethod, ResponseValidator } from 'openapi'
import {
  ResourceRequestArgs,
  CollectionRequestArgs,
  BaseDeps,
  RouteDeps
} from '.'
import { CreateQuoteArgs, getRSPath, Quote } from '../types'
import { get, post } from './requests'

export interface QuoteRoutes {
  get(args: ResourceRequestArgs): Promise<Quote>
  create(
    createArgs: CollectionRequestArgs,
    createQuoteArgs: CreateQuoteArgs
  ): Promise<Quote>
}

/** @hidden */
export const createQuoteRoutes = (deps: RouteDeps): QuoteRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getQuoteOpenApiValidator = openApi.createResponseValidator<Quote>({
    path: getRSPath('/quotes/{id}'),
    method: HttpMethod.GET
  })

  const createQuoteOpenApiValidator = openApi.createResponseValidator<Quote>({
    path: getRSPath('/quotes'),
    method: HttpMethod.POST
  })

  return {
    get: (args: ResourceRequestArgs) =>
      getQuote({ axiosInstance, logger }, args, getQuoteOpenApiValidator),
    create: (
      createArgs: CollectionRequestArgs,
      createQuoteArgs: CreateQuoteArgs
    ) =>
      createQuote(
        { axiosInstance, logger },
        createArgs,
        createQuoteOpenApiValidator,
        createQuoteArgs
      )
  }
}

/** @hidden */
export const getQuote = async (
  deps: BaseDeps,
  args: ResourceRequestArgs,
  validateOpenApiResponse: ResponseValidator<Quote>
) => {
  const { axiosInstance, logger } = deps

  const quote = await get(
    { axiosInstance, logger },
    args,
    validateOpenApiResponse
  )

  return quote
}

/** @hidden */
export const createQuote = async (
  deps: BaseDeps,
  createArgs: CollectionRequestArgs,
  validateOpenApiResponse: ResponseValidator<Quote>,
  createQuoteArgs: CreateQuoteArgs
) => {
  const { axiosInstance, logger } = deps
  const { accessToken, paymentPointer } = createArgs
  const url = `${paymentPointer}${getRSPath('/quotes')}`

  const quote = await post(
    { axiosInstance, logger },
    { url, accessToken, body: createQuoteArgs },
    validateOpenApiResponse
  )

  return quote
}
