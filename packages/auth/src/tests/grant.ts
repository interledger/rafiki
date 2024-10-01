import { v4 } from 'uuid'
import { faker } from '@faker-js/faker'
import { AccessAction, AccessType } from '@interledger/open-payments'
import { IocContract } from '@adonisjs/fold'
import { AppServices } from '../app'
import {
  Grant,
  GrantState,
  GrantFinalization,
  StartMethod,
  FinishMethod
} from '../grant/model'
import { generateNonce, generateToken } from '../shared/utils'
import { Tenant } from '../tenants/model'

const CLIENT = faker.internet.url({ appendSlash: false })

export async function createGrant(
  deps: IocContract<AppServices>,
  options?: { identifier?: string }
): Promise<Grant> {
  const tenantService = await deps.use('tenantService')
  const tenantId = (
    (await tenantService.create({
      tenantId: v4(),
      idpConsentEndpoint: faker.internet.url(),
      idpSecret: 'test-secret'
    })) as Tenant
  ).id
  const grantService = await deps.use('grantService')
  const BASE_GRANT_ACCESS = {
    actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
    identifier: options?.identifier
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

  return await grantService.create(
    {
      ...BASE_GRANT_REQUEST,
      access_token: {
        access: [
          {
            ...BASE_GRANT_ACCESS,
            type: AccessType.IncomingPayment
          }
        ]
      }
    },
    tenantId
  )
}

export interface GenerateBaseGrantOptions {
  tenantId: string
  state?: GrantState
  finalizationReason?: GrantFinalization
  noFinishMethod?: boolean
}

export const generateBaseGrant = (options: GenerateBaseGrantOptions) => {
  const {
    tenantId,
    state = GrantState.Processing,
    finalizationReason = undefined,
    noFinishMethod = false
  } = options
  return {
    tenantId,
    state,
    finalizationReason,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: noFinishMethod ? undefined : FinishMethod.Redirect,
    finishUri: noFinishMethod ? undefined : 'https://example.com',
    clientNonce: generateNonce(),
    client: CLIENT
  }
}
