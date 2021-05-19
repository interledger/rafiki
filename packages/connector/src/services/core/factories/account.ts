import { Factory } from 'rosie'
import Faker from 'faker'
import { IlpAccount } from '../services'

export const AccountFactory = Factory.define<IlpAccount>(
  'AccountFactory'
).attrs({
  accountId: Faker.datatype.uuid,
  disabled: false,
  balance: {
    current: 0n,
    assetCode: Faker.finance.currencyCode().toString().toUpperCase(),
    assetScale: Faker.datatype.number(6)
  }
})

export const PeerAccountFactory = Factory.extend(AccountFactory).attrs({
  http: {
    incomingTokens: Facker.datatype.string(32),
    incomingEndpoint: Faker.internet.url(),
    outgoingToken: Faker.datatype.string(32),
    outgoingEndpoint: Faker.internet.url()
  }
}).attr('routing', ['_counter'], (counter) => ({
  prefixes: [`test.${counter}.`],
  ilpAddress: `test.${counter}`
}))
