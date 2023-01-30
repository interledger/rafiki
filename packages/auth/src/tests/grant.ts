import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { FinishMethod, Grant, StartMethod } from '../grant/model'
import { generateNonce } from '../shared/utils'
import { AccessAction, AccessType } from 'open-payments'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'

export async function createGrant(
  deps: IocContract<AppServices>
): Promise<Grant> {
  const grantService = await deps.use('grantService')
  const CLIENT = faker.internet.url()
  const BASE_GRANT_ACCESS = {
    actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
    identifier: `https://example.com/${uuid()}`
  }

  const BASE_GRANT_REQUEST = {
    client: CLIENT,
    interact: {
      start: [StartMethod.Redirect],
      finish: {
        method: FinishMethod.Redirect,
        uri: 'https://example.com/finish',
        nonce: generateNonce()
      }
    }
  }

  return await grantService.create({
    ...BASE_GRANT_REQUEST,
    access_token: {
      access: [
        {
          ...BASE_GRANT_ACCESS,
          type: AccessType.IncomingPayment
        }
      ]
    }
  })
}
