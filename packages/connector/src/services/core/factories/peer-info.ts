import { Factory } from 'rosie'
import { PeerInfo } from '../types'
import faker from 'faker'

export const PeerInfoFactory = Factory.define<PeerInfo>('PeerInfo').attrs({
  id: faker.name.firstName(),
  relation: 'child',
  isCcpReceiver: false,
  isCcpSender: false,
  url: faker.internet.url(),
  accountId: faker.finance.accountName()
})
