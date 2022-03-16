import { Factory } from 'rosie'
import { faker } from '@faker-js/faker'
import {
  MockIncomingAccount,
  MockOutgoingAccount
} from '../test/mocks/accounting-service'

const assetCode = faker.finance.currencyCode().toString().toUpperCase()
const assetScale = faker.datatype.number(6)

const accountAttrs = {
  id: faker.datatype.uuid,
  asset: {
    id: faker.datatype.uuid(),
    code: assetCode,
    scale: assetScale,
    unit: faker.datatype.number(),
    asset: {
      id: faker.datatype.uuid(),
      unit: faker.datatype.number()
    }
  },
  balance: 0n
}

export const IncomingAccountFactory = Factory.define<MockIncomingAccount>(
  'IncomingAccountFactory'
).attrs(accountAttrs)

export const OutgoingAccountFactory = Factory.define<MockOutgoingAccount>(
  'OutgoingAccountFactory'
).attrs(accountAttrs)

export const IncomingPeerFactory = Factory.define<MockIncomingAccount>(
  'IncomingPeerFactory'
)
  .extend(IncomingAccountFactory)
  .attrs({
    http: () => ({
      incoming: {
        authTokens: [faker.datatype.string(32)]
      }
    }),
    maxPacketAmount: BigInt(faker.datatype.number())
  })
  .attr('staticIlpAddress', ['id'], (id: string) => {
    return `test.${id}`
  })

export const OutgoingPeerFactory = Factory.define<MockOutgoingAccount>(
  'OutgoingPeerFactory'
)
  .extend(OutgoingAccountFactory)
  .attrs({
    http: () => ({
      outgoing: {
        authToken: faker.datatype.string(32),
        endpoint: faker.internet.url()
      }
    })
  })
  .attr('staticIlpAddress', ['id'], (id: string) => {
    return `test.${id}`
  })

export const IncomingPaymentAccountFactory = Factory.define<MockOutgoingAccount>(
  'IncomingPaymentAccountFactory'
)
  .extend(OutgoingAccountFactory)
  .option('amount', BigInt(0))
  .attrs({
    active: true
  })

export const AccountFactory = Factory.define<MockOutgoingAccount>(
  'AccountFactory'
).extend(OutgoingAccountFactory)
