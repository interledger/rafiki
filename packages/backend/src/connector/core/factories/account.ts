import { Factory } from 'rosie'
import Faker from 'faker'
import { MockIlpAccount } from '../test/mocks/accounts-service'

const assetCode = Faker.finance.currencyCode().toString().toUpperCase()
const assetScale = Faker.datatype.number(6)

export const AccountFactory = Factory.define<MockIlpAccount>(
  'AccountFactory'
).attrs({
  id: Faker.datatype.uuid,
  sendEnabled: true,
  receiveEnabled: true,
  finalized: false,
  asset: { code: assetCode, scale: assetScale },
  stream: {
    enabled: true
  },
  balance: 0n
})

export const PeerAccountFactory = Factory.define<MockIlpAccount>(
  'PeerAccountFactory'
)
  .extend(AccountFactory)
  .attrs({
    http: () => ({
      incoming: {
        authTokens: [Faker.datatype.string(32)]
      },
      outgoing: {
        authToken: Faker.datatype.string(32),
        endpoint: Faker.internet.url()
      }
    }),
    maxPacketAmount: BigInt(Faker.datatype.number()),
    stream: {
      enabled: false
    }
  })
  .attr('staticIlpAddress', ['id'], (id: string) => {
    return `test.${id}`
  })
