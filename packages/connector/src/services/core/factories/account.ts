import { Factory } from 'rosie'
import Faker from 'faker'
import { IlpAccount } from '../services'

const assetCode = Faker.finance.currencyCode().toString().toUpperCase()
const assetScale = Faker.datatype.number(6)

export const AccountFactory = Factory.define<IlpAccount>(
  'AccountFactory'
).attrs({
  accountId: Faker.datatype.uuid,
  disabled: false,
  balance: () => ({
    current: 0n,
    assetCode,
    assetScale
  })
})

export const PeerAccountFactory = Factory.define<IlpAccount>(
  'PeerAccountFactory'
)
  .extend(AccountFactory)
  .attrs({
    http: () => ({
      incomingTokens: [Faker.datatype.string(32)],
      incomingEndpoint: Faker.internet.url(),
      outgoingToken: Faker.datatype.string(32),
      outgoingEndpoint: Faker.internet.url()
    })
  })
  .attr('routing', ['accountId'], (id: string) => {
    return {
      prefixes: [`test.${id}.`],
      ilpAddress: `test.${id}`
    }
  })
