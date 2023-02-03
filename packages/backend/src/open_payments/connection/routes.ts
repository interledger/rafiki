import { Logger } from 'pino'
import { IncomingPaymentService } from '../payment/incoming/service'
import { ConnectionContext } from './middleware'
import { ConnectionService } from './service'

interface ServiceDependencies {
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  connectionService: ConnectionService
}

export interface ConnectionRoutes {
  get(ctx: ConnectionContext): Promise<void>
}

export function createConnectionRoutes(
  deps_: ServiceDependencies
): ConnectionRoutes {
  const logger = deps_.logger.child({
    service: 'ConnectionRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: ConnectionContext) => getConnection(deps, ctx)
  }
}

async function getConnection(
  deps: ServiceDependencies,
  ctx: ConnectionContext
): Promise<void> {
  const connection = deps.connectionService.get(ctx.incomingPayment)
  if (!connection) return ctx.throw(404)
  ctx.body = connection.toOpenPaymentsType()
}
