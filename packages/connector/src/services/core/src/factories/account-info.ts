import { Factory } from 'rosie'
import Faker from 'faker'
import { AccountInfo } from '../types/account'

export const AccountInfoFactory = Factory.define<AccountInfo>(
  'AccountInfoFactory'
).attrs({
  id: Faker.random.uuid,
  peerId: Faker.name.firstName(),
  assetCode: Faker.finance
    .currencyCode()
    .toString()
    .toUpperCase(),
  assetScale: Faker.random.number(6),
  maximumPayable: BigInt(Faker.random.number({ min: 1000, max: 2000 })),
  maximumReceivable: BigInt(Faker.random.number({ min: 1000, max: 2000 })),
  settleTo: BigInt(Faker.random.number(250)),
  settlementThreshold: BigInt(Faker.random.number(800)),
  settlementEngine: 'test-settlement-engine'
})
