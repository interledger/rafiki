import { StreamServer } from '@interledger/stream-receiver'
import { BaseService } from '../../../shared/baseService'
import { StreamCredentials as IlpStreamCredentials } from '@interledger/stream-receiver'
import { IAppConfig } from '../../../config/app'

export { IlpStreamCredentials }

interface GetStreamCredentialsArgs {
  ilpAddress: string
  paymentTag: string
  asset: {
    scale: number
    code: string
  }
}

export interface StreamCredentialsService {
  get(args: GetStreamCredentialsArgs): IlpStreamCredentials | undefined
}

export interface ServiceDependencies extends BaseService {
  config: IAppConfig
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
    get: (args) => getStreamCredentials(deps, args)
  }
}

function getStreamCredentials(
  deps: ServiceDependencies,
  args: GetStreamCredentialsArgs
): IlpStreamCredentials | undefined {
  const streamServer = new StreamServer({
    serverSecret: deps.config.streamSecret,
    serverAddress: args.ilpAddress
  })

  const credentials = streamServer.generateCredentials({
    paymentTag: args.paymentTag,
    asset: args.asset
  })
  return credentials
}
