import crypto from 'crypto'
import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'

export function generateTenant() {
  return {
    id: v4(),
    apiSecret: v4(),
    idpConsentUrl: faker.internet.url(),
    idpSecret: crypto.randomBytes(8).toString('base64')
  }
}
