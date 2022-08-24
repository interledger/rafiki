import base64url from 'base64url'
import { Logger } from 'pino'
import { ReadContext } from '../../app'
import { IAppConfig } from '../../config/app'
import { IncomingPaymentService } from '../payment/incoming/service'
import { ConnectionService } from './service'

interface ServiceDependencies {
  config: IAppConfig
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  connectionService: ConnectionService
}

export interface ConnectionRoutes {
  get(ctx: ReadContext): Promise<void>
}

export function createConnectionRoutes(
  deps_: ServiceDependencies
): ConnectionRoutes {
  const logger = deps_.logger.child({
    service: 'ConnectionRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ReadContext) => getConnection(deps, ctx)
  }
}

async function getConnection(
  deps: ServiceDependencies,
  ctx: ReadContext
): Promise<void> {
  const id = ctx.params.connectionId
  const incomingPayment = await deps.incomingPaymentService.getByConnection(id)
  if (!incomingPayment) return ctx.throw(404)

  const streamCredentials = deps.connectionService.get(incomingPayment)
  ctx.body = {
    id: `${deps.config.openPaymentsHost}/connections/${id}`,
    ilpAddress: streamCredentials.ilpAddress,
    sharedSecret: base64url(streamCredentials.sharedSecret)
  }
}
