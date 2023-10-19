import { StreamServer } from '@interledger/stream-receiver'
import { BaseService } from '../../shared/baseService'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { IlpAddress } from 'ilp-packet'

export interface Connection {
  ilpAddress: IlpAddress
  sharedSecret: Buffer
}

export interface ConnectionService {
  get(payment: IncomingPayment): Connection | undefined
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
    get: (payment) => getConnection(deps, payment)
  }
}

function getConnection(
  deps: ServiceDependencies,
  payment: IncomingPayment
): Connection | undefined {
  if (
    [IncomingPaymentState.Completed, IncomingPaymentState.Expired].includes(
      payment.state
    )
  ) {
    return undefined
  }
  const credentials = deps.streamServer.generateCredentials({
    paymentTag: payment.id,
    asset: {
      code: payment.asset.code,
      scale: payment.asset.scale
    }
  })
  return {
    ilpAddress: credentials.ilpAddress,
    sharedSecret: credentials.sharedSecret
  }
}
