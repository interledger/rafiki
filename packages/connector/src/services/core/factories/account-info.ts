import { Factory } from 'rosie'
import Faker from 'faker'
import { AccountInfo } from '../types/account'

export const AccountInfoFactory = Factory.define<AccountInfo>(
  'AccountInfoFactory'
).attrs({
  id: Faker.datatype.uuid,
  assetCode: Faker.finance.currencyCode().toString().toUpperCase(),
  assetScale: Faker.datatype.number(6)
})
