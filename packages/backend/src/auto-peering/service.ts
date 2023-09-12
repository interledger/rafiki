import { AssetService } from '../asset/service'
import { IAppConfig } from '../config/app'
import { BaseService } from '../shared/baseService'

export interface PeeringDetails {
  ilpAddress: string
  assets: { code: string; scale: number }[]
}

export interface AutoPeeringService {
  getPeeringDetails(): Promise<PeeringDetails>
}

export interface ServiceDependencies extends BaseService {
  assetService: AssetService
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
    getPeeringDetails: () => getPeeringDetails(deps)
  }
}

async function getPeeringDetails(
  deps: ServiceDependencies
): Promise<PeeringDetails> {
  const assets = await deps.assetService.getAll()

  return {
    ilpAddress: deps.config.ilpAddress,
    assets: assets.map((asset) => ({
      code: asset.code,
      scale: asset.scale
    }))
  }
}
