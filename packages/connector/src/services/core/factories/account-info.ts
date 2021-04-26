import { Factory } from 'rosie'
import Faker from 'faker'
import { AccountInfo } from '../types/account'

export const AccountInfoFactory = Factory.define<AccountInfo>(
  'AccountInfoFactory'
).attrs({
  id: Faker.datatype.uuid,
  peerId: Faker.name.firstName(),
  assetCode: Faker.finance
    .currencyCode()
    .toString()
    .toUpperCase(),
  assetScale: Faker.datatype.number(6),
  maximumPayable: BigInt(Faker.datatype.number({ min: 1000, max: 2000 })),
  maximumReceivable: BigInt(Faker.datatype.number({ min: 1000, max: 2000 })),
  settleTo: BigInt(Faker.datatype.number(250)),
  settlementThreshold: BigInt(Faker.datatype.number(800)),
  settlementEngine: 'test-settlement-engine'
})
