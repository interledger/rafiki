import { Factory } from 'rosie'
import { Peer } from '../services/peers'
import { PeerInfoFactory } from './peer-info'
import { IlpFulfillFactory } from './ilp-packet'
import { serializeIlpFulfill } from 'ilp-packet'

const fulfill = serializeIlpFulfill(IlpFulfillFactory.build())
export const PeerFactory = Factory.define<Peer>('Peer').attrs({
  ...PeerInfoFactory.build(),
  send: () => jest.fn().mockResolvedValue(fulfill)
})
