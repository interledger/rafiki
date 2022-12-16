import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { CreateQuoteArgs, getRSPath, Quote } from '../types'
import { get, post } from './requests'

interface GetArgs {
  url: string
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

  const getQuoteValidator = openApi.createResponseValidator<Quote>({
    path: getRSPath('/quotes/{id}'),
    method: HttpMethod.GET
  })

  const createQuoteValidator = openApi.createResponseValidator<Quote>({
    path: getRSPath('/quotes'),
    method: HttpMethod.POST
  })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getQuoteValidator),
    create: (args: PostArgs<CreateQuoteArgs>) =>
      post({ axiosInstance, logger }, args, createQuoteValidator)
  }
}
