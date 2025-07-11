import { TransactionOrKnex } from 'objection'
import { AppContext } from '../../app'
import { BaseService } from '../../shared/baseService'
import { POSMerchantError } from '../errors'
import { PosDevice } from './model'
import { PosDeviceService } from './service'
import { POSDeviceError } from './errors'

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
    // device belongs to merchant
    const device = await PosDevice.query(deps.knex)
      .where({
        id: deviceId,
        merchantId: merchantId
      })
      .whereNull('deletedAt')
      .first()

    if (!device) {
      throw new POSMerchantError(404, 'Device not found')
    }

    await deps.posDeviceService.revoke(deviceId)

    ctx.status = 204
  } catch (err) {
    if (err instanceof POSMerchantError || err instanceof POSDeviceError) {
      throw err
    }
    throw new POSMerchantError(400, 'Could not revoke device', { err })
  }
}
