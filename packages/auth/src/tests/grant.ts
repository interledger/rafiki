import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { FinishMethod, Grant, GrantState, StartMethod } from '../grant/model'
import { generateNonce, generateToken } from '../shared/utils'
import { AccessAction, AccessType } from 'open-payments'
import { GrantRequest } from '../grant/service'

export async function createGrant(): Promise<Grant> {
  const CLIENT = faker.internet.url()
  const grant = await Grant.query().insert({
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: uuid(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com',
    clientNonce: generateNonce(),
    client: CLIENT,
    interactId: uuid(),
    interactRef: uuid(),
    interactNonce: generateNonce()
  })

  return grant
}

export function getGrantRequest(): GrantRequest {
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

  return {
    ...BASE_GRANT_REQUEST,
    access_token: {
      access: [
        {
          ...BASE_GRANT_ACCESS,
          type: AccessType.IncomingPayment
        }
      ]
    }
  }
}
