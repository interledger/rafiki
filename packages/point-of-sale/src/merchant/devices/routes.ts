import { AppContext } from '../../app'
import { BaseService } from '../../shared/baseService'
import { PosDeviceRouteError, isPosDeviceError } from './errors'
import { CreateOptions, PosDeviceService } from './service'

interface ServiceDependencies extends BaseService {
  posDeviceService: PosDeviceService
}

export type CreateBody = {
  publicKey: string
  deviceName: string
  walletAddress: string
  algorithm: string
}

type RegisterDeviceRequest = Exclude<AppContext['request'], 'body'> & {
  body: CreateBody
}

export type RegisterDeviceContext = Exclude<AppContext, 'request'> & {
  request: RegisterDeviceRequest
}

export interface PosDeviceRoutes {
  register(ctx: RegisterDeviceContext): Promise<void>
}

export function createPosDeviceRoutes(
  deps_: ServiceDependencies
): PosDeviceRoutes {
  const log = deps_.logger.child({
    service: 'PosDeviceRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    register: (ctx: RegisterDeviceContext) => registerDevice(deps, ctx)
  }
}

async function registerDevice(
  deps: ServiceDependencies,
  ctx: RegisterDeviceContext
): Promise<void> {
  const { body } = ctx.request
  const { merchantId } = ctx.params
  const options: CreateOptions = {
    merchantId,
    publicKey: body.publicKey,
    deviceName: body.deviceName,
    walletAddress: body.walletAddress,
    algorithm: body.algorithm
  }
  const posDeviceOrError = await deps.posDeviceService.registerDevice(options)

  if (isPosDeviceError(posDeviceOrError))
    throw new PosDeviceRouteError(posDeviceOrError)

  const { keyId, algorithm } = posDeviceOrError
  ctx.status = 201
  ctx.body = {
    keyId,
    algorithm
  }
}
