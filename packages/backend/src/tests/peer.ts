import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isPeerError } from '../payment-method/ilp/peer/errors'
import { Peer } from '../payment-method/ilp/peer/model'
import { CreateOptions, HttpOptions } from '../payment-method/ilp/peer/service'
import { createAsset } from './asset'

export async function createPeer(
  deps: IocContract<AppServices>,
  options: Omit<Partial<CreateOptions>, 'http'> & {
    http?: Partial<HttpOptions>
  } = {}
): Promise<Peer> {
  const peerOptions: CreateOptions = {
    assetId:
      options.assetId ||
      (await createAsset(deps, { tenantId: options.tenantId })).id,
    http: {
      outgoing: options.http?.outgoing || {
        authToken: faker.string.sample(32),
        endpoint: faker.internet.url({ appendSlash: false })
      }
    },
    staticIlpAddress: options.staticIlpAddress || 'test.' + uuid()
  }
  if (options.http?.incoming) {
    peerOptions.http.incoming = options.http.incoming
  }
  if (options.maxPacketAmount) {
    peerOptions.maxPacketAmount = options.maxPacketAmount
  }
  if (options.liquidityThreshold) {
    peerOptions.liquidityThreshold = options.liquidityThreshold
  }
  const peerService = await deps.use('peerService')
  const peer = await peerService.create(peerOptions)
  if (isPeerError(peer)) {
    throw new Error('unable to create peer, err=' + peer)
  }

  return peer
}
