import { HttpMethod } from 'openapi'
import { ResourceRequestArgs, RouteDeps } from '.'
import { getRSPath, Quote } from '../types'
import { get } from './requests'

export interface QuoteRoutes {
  get(args: ResourceRequestArgs): Promise<Quote>
}

export const createQuoteRoutes = (deps: RouteDeps): QuoteRoutes => {
  const { axiosInstance, openApi, logger } = deps

  const getQuoteValidator = openApi.createResponseValidator<Quote>({
    path: getRSPath('/quotes/{id}'),
    method: HttpMethod.GET
  })

  return {
    get: (args: ResourceRequestArgs) =>
      get({ axiosInstance, logger }, args, getQuoteValidator)
  }
}
