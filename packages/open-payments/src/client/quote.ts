import { HttpMethod, ResponseValidator } from 'openapi'
import { BaseDeps, RouteDeps } from '.'
import { CreateQuoteArgs, getRSPath, Quote } from '../types'
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

export interface QuoteRoutes {
  get(args: GetArgs): Promise<Quote>
  create(args: PostArgs<CreateQuoteArgs>): Promise<Quote>
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
    get: (args: GetArgs) => getQuote(deps, args, getQuoteOpenApiValidator),
    create: (args: PostArgs<CreateQuoteArgs>) =>
      createQuote(deps, args, createQuoteOpenApiValidator)
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
  args: PostArgs<CreateQuoteArgs>,
  validateOpenApiResponse: ResponseValidator<Quote>
) => {
  const { axiosInstance, logger } = deps

  const quote = await post(
    { axiosInstance, logger },
    args,
    validateOpenApiResponse
  )

  return quote
}
