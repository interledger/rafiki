import { TransactionOrKnex } from 'objection'
import { AppContext } from '../../app'
import { BaseService } from '../../shared/baseService'
import { DeviceError, DeviceServiceError, POSDeviceError } from './errors'
import { PosDeviceService } from './service'

interface ServiceDependencies extends BaseService {
  posDeviceService: PosDeviceService
  knex: TransactionOrKnex
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

export interface DeviceRoutes {
  revoke(ctx: RevokeDeviceContext): Promise<void>
}

export function createDeviceRoutes(deps_: ServiceDependencies): DeviceRoutes {
  const log = deps_.logger.child({
    service: 'DeviceRoutes'
  })

  const deps = {
    ...deps_,
    logger: log
  }

  return {
    revoke: (ctx: RevokeDeviceContext) => revokeDevice(deps, ctx)
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
