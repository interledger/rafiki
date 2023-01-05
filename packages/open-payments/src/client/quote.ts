import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import { CreateQuoteArgs, getRSPath, Quote } from '../types'
import { get, post } from './requests'

interface GetArgs {
  url: string
  accessToken: string
}

interface CreateArgs {
  paymentPointer: string
  accessToken: string
}

export interface QuoteRoutes {
  get(args: GetArgs): Promise<Quote>
  create(
    createArgs: CreateArgs,
    createQuoteArgs: CreateQuoteArgs
  ): Promise<Quote>
}

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
    get: (args: GetArgs) =>
      getQuote({ axiosInstance, logger }, args, getQuoteOpenApiValidator),
    create: (createArgs: CreateArgs, createQuoteArgs: CreateQuoteArgs) =>
      createQuote(
        { axiosInstance, logger },
        createArgs,
        createQuoteOpenApiValidator,
        createQuoteArgs
      )
  }
}

export const getQuote = async (
  deps: BaseDeps,
  args: GetArgs,
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

export const createQuote = async (
  deps: BaseDeps,
  createArgs: CreateArgs,
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
