import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'

import { isPeerError } from '../peer/errors'
import { Peer } from '../peer/model'
import { CreateOptions, HttpOptions, PeerService } from '../peer/service'
import { randomAsset } from './asset'

type BuildOptions = Omit<Partial<CreateOptions>, 'http'> & {
  http?: Partial<HttpOptions>
}

export class PeerFactory {
  public constructor(private peers: PeerService) {}

  public async build(options: BuildOptions = {}): Promise<Peer> {
    const peerOptions: CreateOptions = {
      asset: options.asset || randomAsset(),
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
    const peer = await this.peers.create(peerOptions)
    if (isPeerError(peer)) {
      throw new Error('unable to create peer, err=' + peer)
    }

    return peer
  }
}
