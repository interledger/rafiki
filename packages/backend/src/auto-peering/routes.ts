import { AppContext } from '../app'
import { BaseService } from '../shared/baseService'
import { errorToCode, errorToMessage, isAutoPeeringError } from './errors'
import { AutoPeeringService } from './service'

interface PeeringRequestArgs {
  staticIlpAddress: string
  ilpConnectorAddress: string
  asset: { code: string; scale: number }
  httpToken: string
  maxPacketAmount?: number
  name?: string
}

export type PeerRequestContext = Exclude<AppContext, 'request'> & {
  request: {
    body: PeeringRequestArgs
  }
}

export interface ServiceDependencies extends BaseService {
  autoPeeringService: AutoPeeringService
}

export interface AutoPeeringRoutes {
  acceptPeerRequest(ctx: PeerRequestContext): Promise<void>
}

export async function createAutoPeeringRoutes(
  deps_: ServiceDependencies
): Promise<AutoPeeringRoutes> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'AutoPeeringRoutes'
    })
  }

  return {
    acceptPeerRequest: (ctx: PeerRequestContext) => acceptPeerRequest(deps, ctx)
  }
}

async function acceptPeerRequest(
  deps: ServiceDependencies,
  ctx: PeerRequestContext
): Promise<void> {
  const peeringDetailsOrError =
    await deps.autoPeeringService.acceptPeeringRequest(ctx.request.body)

  if (isAutoPeeringError(peeringDetailsOrError)) {
    const errorCode = errorToCode[peeringDetailsOrError]
    ctx.status = errorCode
    ctx.body = {
      error: {
        code: errorCode,
        message: errorToMessage[peeringDetailsOrError],
        type: peeringDetailsOrError
      }
    }
  } else {
    ctx.status = 200
    ctx.body = peeringDetailsOrError
  }
}
