import { HttpMethod } from 'openapi'
import { RouteDeps } from '.'
import { getRSPath, Quote } from '../types'
import { get } from './requests'

interface GetArgs {
  url: string
}

export interface QuoteRoutes {
  get(args: GetArgs): Promise<Quote>
}

export const createQuoteRoutes = (
  deps: RouteDeps
): QuoteRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getQuoteValidator =
    openApi.createResponseValidator<Quote>({
      path: getRSPath('/quotes/{id}'),
      method: HttpMethod.GET
    })

  return {
    get: (args: GetArgs) =>
      get({ axiosInstance, logger }, args, getQuoteValidator)
  }
}
