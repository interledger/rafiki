import { Factory } from 'rosie'
import { faker } from '@faker-js/faker'
import {
  MockIncomingAccount,
  MockOutgoingAccount
} from '../test/mocks/accounting-service'

const assetCode = faker.finance.currencyCode().toString().toUpperCase()
const assetScale = faker.number.int(6)

const accountAttrs = {
  id: faker.string.uuid,
  asset: {
    id: faker.string.uuid(),
    code: assetCode,
    scale: assetScale,
    ledger: faker.number.int(),
    asset: {
      id: faker.string.uuid(),
      ledger: faker.number.int()
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
        authTokens: [faker.string.sample(32)]
      }
    }),
    maxPacketAmount: BigInt(faker.number.int())
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
        authToken: faker.string.sample(32),
        endpoint: faker.internet.url({ appendSlash: false })
      }
    })
  })
  .attr('staticIlpAddress', ['id'], (id: string) => {
    return `test.${id}`
  })

export const IncomingPaymentAccountFactory =
  Factory.define<MockOutgoingAccount>('IncomingPaymentAccountFactory')
    .extend(OutgoingAccountFactory)
    .option('amount', BigInt(0))
    .attrs({
      state: 'PENDING'
    })

export const AccountFactory = Factory.define<MockOutgoingAccount>(
  'AccountFactory'
).extend(OutgoingAccountFactory)
