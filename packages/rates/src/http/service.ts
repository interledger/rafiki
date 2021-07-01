import * as http from 'http'
import Koa from 'koa'
import Router from '@koa/router'
import { LoggingService } from '../logger'
import { Config } from '../config'
import { ECBService } from '../ecb/service'
import { XRPService } from '../xrp/service'

interface ServiceDependencies {
  config: Config
  logger: LoggingService
  ecbService: ECBService
  xrpService: XRPService
}

export type HTTPService = http.Server

export async function createHTTPService(
  deps: ServiceDependencies
): Promise<HTTPService> {
  const prices = await deps.ecbService.fetchPrices()
  prices.XRP = await deps.xrpService.fetchPrice()
  deps.logger.info({ prices }, 'prices fetched')

  const router = new Router()
  router.get('/healthz', (ctx: Koa.Context): void => {
    ctx.status = 200
  })

  router.get('/prices', (ctx: Koa.Context): void => {
    ctx.body = prices
  })

  deps.logger.info(`server listening on http://127.0.0.1:${deps.config.port}`)
  const koa = new Koa()
  koa.use(router.middleware())
  return koa.listen(deps.config.port)
}
