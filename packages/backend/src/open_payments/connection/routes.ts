import { Logger } from 'pino'
import { AppContext } from '../../app'
import { IncomingPaymentService } from '../payment/incoming/service'
import { ConnectionService } from './service'

interface ServiceDependencies {
  logger: Logger
  incomingPaymentService: IncomingPaymentService
  connectionService: ConnectionService
}

export interface ConnectionRoutes {
  get(ctx: AppContext): Promise<void>
}

export function createConnectionRoutes(
  deps_: ServiceDependencies
): ConnectionRoutes {
  const logger = deps_.logger.child({
    service: 'ConnectionRoutes'
  })
  const deps = { ...deps_, logger }
  return {
    get: (ctx: AppContext) => getConnection(deps, ctx)
  }
}

async function getConnection(
  deps: ServiceDependencies,
  ctx: AppContext
): Promise<void> {
  const incomingPayment = await deps.incomingPaymentService.getByConnection(
    ctx.params.id
  )
  if (!incomingPayment) return ctx.throw(404)

  const connection = deps.connectionService.get(incomingPayment)
  if (!connection) return ctx.throw(404)
  ctx.body = connection.toJSON()
}
