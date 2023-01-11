import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { IocContract } from '@adonisjs/fold'

import { AppServices } from '../app'
import { isPeerError } from '../peer/errors'
import { Peer } from '../peer/model'
import { CreateOptions, HttpOptions } from '../peer/service'
import { createAsset } from './asset'

export async function createPeer(
  deps: IocContract<AppServices>,
  options: Omit<Partial<CreateOptions>, 'http'> & {
    http?: Partial<HttpOptions>
  } = {}
): Promise<Peer> {
  const peerOptions: CreateOptions = {
    assetId: options.assetId || (await createAsset(deps)).id,
    http: {
      outgoing: options.http?.outgoing || {
        authToken: faker.datatype.string(32),
        endpoint: faker.internet.url()
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
  const peerService = await deps.use('peerService')
  const peer = await peerService.create(peerOptions)
  if (isPeerError(peer)) {
    throw new Error('unable to create peer, err=' + peer)
  }

  return peer
}
