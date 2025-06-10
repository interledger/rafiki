import { StreamServer } from '@interledger/stream-receiver'
import { BaseService } from '../../../shared/baseService'
import { StreamCredentials as IlpStreamCredentials } from '@interledger/stream-receiver'

export { IlpStreamCredentials }

interface GetStreamCredentialsArgs {
  paymentTag: string
  asset: {
    scale: number
    code: string
  }
}

export interface StreamCredentialsService {
  get(payment: GetStreamCredentialsArgs): IlpStreamCredentials | undefined
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
  args: GetStreamCredentialsArgs
): IlpStreamCredentials | undefined {
  const credentials = deps.streamServer.generateCredentials({
    paymentTag: args.paymentTag,
    asset: args.asset
  })
  return credentials
}
