import { randomInt } from 'crypto'
import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isFeeError } from '../fee/errors'
import { Fee, FeeType } from '../fee/model'
import { CreateOptions } from '../fee/service'

export async function createFee(
  deps: IocContract<AppServices>,
  assetId: string
): Promise<Fee> {
  const feeService = await deps.use('feeService')
  const options: CreateOptions = {
    assetId: assetId,
    type: Math.random() < 0.5 ? FeeType.Sending : FeeType.Receiving,
    fee: {
      fixed: BigInt(randomInt(1, 10000)),
      basisPoints: randomInt(1, 10000)
    }
  }

  const fee = await feeService.create(options)
  if (isFeeError(fee)) {
    throw new Error('unable to create fee, err=' + fee)
  }

  return fee
}
