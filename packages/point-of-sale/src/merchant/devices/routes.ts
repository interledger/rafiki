import { AppContext } from '../../app'
import { BaseService } from '../../shared/baseService'
import { DeviceError, DeviceServiceError, POSDeviceError } from './errors'
import { CreateOptions, PosDeviceService } from './service'

interface ServiceDependencies extends BaseService {
  posDeviceService: PosDeviceService
}

type RevokeDeviceRequest = Exclude<AppContext['request'], 'params'> & {
  params: {
    merchantId: string
    deviceId: string
  }
}

export type RevokeDeviceContext = Exclude<AppContext, 'request'> & {
  request: RevokeDeviceRequest
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
  revoke(ctx: RevokeDeviceContext): Promise<void>
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
    revoke: (ctx: RevokeDeviceContext) => revokeDevice(deps, ctx),
    register: (ctx: RegisterDeviceContext) => registerDevice(deps, ctx)
  }
}

async function revokeDevice(
  deps: ServiceDependencies,
  ctx: RevokeDeviceContext
): Promise<void> {
  const { merchantId, deviceId } = ctx.request.params
  try {
    const device = await deps.posDeviceService.getMerchantDevice(
      merchantId,
      deviceId
    )
    if (!device || device.deletedAt) {
      throw new DeviceServiceError(DeviceError.DeviceNotFound)
    }

    await deps.posDeviceService.revoke(deviceId)

    ctx.status = 204
  } catch (err) {
    if (err instanceof DeviceServiceError) {
      throw new POSDeviceError(err)
    }
    throw new POSDeviceError(400, 'Could not revoke device', { err })
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
  try {
    const posDevice = await deps.posDeviceService.registerDevice(options)
    const { keyId, algorithm } = posDevice
    ctx.status = 201
    ctx.body = {
      keyId,
      algorithm
    }
  } catch (err) {
    if (err instanceof DeviceServiceError) {
      throw new POSDeviceError(err)
    }
    throw new POSDeviceError(400, 'Could not register device', { err })
  }
}
