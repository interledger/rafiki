import { randomInt } from 'crypto'
import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isAssetError } from '../asset/errors'
import { Asset } from '../asset/model'
import { AssetOptions } from '../asset/service'

// Use unique assets as a workaround for not being able to reset
// TigerBeetle between tests
export function randomAsset(): { code: string; scale: number } {
  const letters: number[] = []
  while (letters.length < 3) {
    letters.push(randomInt(65, 91))
  }
  return {
    code: String.fromCharCode(...letters),
    scale: randomInt(0, 256)
  }
}

export function randomLedger(): number {
  return randomInt(2 ** 16)
}

export async function createAsset(
  deps: IocContract<AppServices>,
  options?: AssetOptions
): Promise<Asset> {
  const assetService = await deps.use('assetService')
  const assetOrError = await assetService.create(options || randomAsset())
  if (isAssetError(assetOrError)) {
    throw assetOrError
  }
  return assetOrError
}
