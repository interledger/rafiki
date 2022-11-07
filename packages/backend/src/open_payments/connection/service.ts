import { StreamServer } from '@interledger/stream-receiver'

import { BaseService } from '../../shared/baseService'
import { IncomingPayment } from '../payment/incoming/model'
import { Connection } from './model'

export interface ConnectionService {
  get(payment: IncomingPayment): Connection | undefined
  getUrl(payment: IncomingPayment): string | undefined
}

export interface ServiceDependencies extends BaseService {
  openPaymentsUrl: string
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
    get: (payment) => getConnection(deps, payment),
    getUrl: (payment) => getConnectionUrl(deps, payment)
  }
}

function getConnection(
  deps: ServiceDependencies,
  payment: IncomingPayment
): Connection | undefined {
  if (!payment.connectionId) {
    return undefined
  }
  const credentials = deps.streamServer.generateCredentials({
    paymentTag: payment.id,
    asset: {
      code: payment.asset.code,
      scale: payment.asset.scale
    }
  })
  return Connection.fromPayment({
    payment,
    credentials,
    openPaymentsUrl: deps.openPaymentsUrl
  })
}

function getConnectionUrl(
  deps: ServiceDependencies,
  payment: IncomingPayment
): string | undefined {
  if (!payment.connectionId) {
    return undefined
  }
  return `${deps.openPaymentsUrl}/connections/${payment.connectionId}`
}
