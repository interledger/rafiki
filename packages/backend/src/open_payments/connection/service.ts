import { StreamServer } from '@interledger/stream-receiver'
import { BaseService } from '../../shared/baseService'
import {
  IncomingPayment,
  IncomingPaymentState
} from '../payment/incoming/model'
import { StreamCredentials as IlpStreamCredentials } from '@interledger/stream-receiver'

export { IlpStreamCredentials }

export interface StreamCredentialsService {
  get(payment: IncomingPayment): IlpStreamCredentials | undefined
}

export interface ServiceDependencies extends BaseService {
  openPaymentsUrl: string
  streamServer: StreamServer
}

export async function createStreamCredentialsService(
  deps_: ServiceDependencies
): Promise<StreamCredentialsService> {
  const log = deps_.logger.child({
    service: 'StreamCredentialsService'
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
): IlpStreamCredentials | undefined {
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
  return credentials
}
