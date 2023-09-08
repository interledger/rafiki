import { AssetService } from '../asset/service'
import { IAppConfig } from '../config/app'
import { PeerService } from '../peer/service'
import { BaseService } from '../shared/baseService'
import { AutoPeeringError } from './errors'

interface PeeringDetails {
  staticIlpAddress: string
  ilpConnectorAddress: string
  assets: { code: string; scale: number }[]
}

interface PeeringRequestArgs {
  staticIlpAddress: string
  ilpConnectorAddress: string
  asset: { code: string; scale: number }
  httpToken: string
}

export interface AutoPeeringService {
  acceptPeeringRequest(
    args: PeeringRequestArgs
  ): Promise<PeeringDetails | AutoPeeringError>
}

export interface ServiceDependencies extends BaseService {
  assetService: AssetService
  peerService: PeerService
  config: IAppConfig
}

export async function createAutoPeeringService(
  deps_: ServiceDependencies
): Promise<AutoPeeringService> {
  const deps: ServiceDependencies = {
    ...deps_,
    logger: deps_.logger.child({
      service: 'AutoPeeringService'
    })
  }

  return {
    acceptPeeringRequest: (args) => acceptPeeringRequest(deps, args)
  }
}

async function acceptPeeringRequest(
  deps: ServiceDependencies,
  args: PeeringRequestArgs
): Promise<PeeringDetails | AutoPeeringError> {
  const assets = await deps.assetService.getAll()

  const asset = assets.find(
    ({ code, scale }) => code === args.asset.code && scale === args.asset.scale
  )

  if (!asset) {
    return AutoPeeringError.UnsupportedAsset
  }

  await deps.peerService.create({
    staticIlpAddress: args.staticIlpAddress,
    assetId: asset.id,
    http: {
      incoming: {
        authTokens: [args.httpToken]
      },
      outgoing: {
        endpoint: args.ilpConnectorAddress,
        authToken: args.httpToken
      }
    }
  })

  return {
    ilpConnectorAddress: deps.config.ilpConnectorAddress,
    staticIlpAddress: deps.config.ilpAddress,
    assets: assets.map(({ code, scale }) => ({ code, scale }))
  }
}
