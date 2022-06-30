import { StreamCredentials, StreamServer } from '@interledger/stream-receiver'
import { BaseService } from '../../shared/baseService'
import { IncomingPayment } from '../payment/incoming/model'

export interface ConnectionService {
  get(payment: IncomingPayment): StreamCredentials
}

export interface ServiceDependencies extends BaseService {
  streamServer: StreamServer
}

export async function createConnectionService(
  deps_: ServiceDependencies
): Promise<ConnectionService> {
  const log = deps_.logger.child({
    service: 'ConnectionService'
  })
  const deps: ServiceDependencies = {
    ...deps_,
    logger: log
  }
  return {
    get: (payment) => getStreamCredentials(deps, payment)
  }
}

function getStreamCredentials(
  deps: ServiceDependencies,
  payment: IncomingPayment
) {
  return deps.streamServer.generateCredentials({
    paymentTag: payment.id,
    asset: {
      code: payment.asset.code,
      scale: payment.asset.scale
    }
  })
}
