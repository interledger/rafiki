import { IocContract } from '@adonisjs/fold'
import { v4 as uuid } from 'uuid'

import { AppServices } from '../app'
import { Grant, GrantOptions } from '../open_payments/auth/grant'

export async function createGrant(
  deps: IocContract<AppServices>,
  { grant: id, clientId, active = true, access = [] }: Partial<GrantOptions>
): Promise<Grant> {
  const grant = new Grant({
    grant: id || uuid(),
    clientId: clientId || uuid(),
    active,
    access
  })
  const grantReferenceService = await deps.use('grantReferenceService')
  await grantReferenceService.create({
    id: grant.grant,
    clientId: grant.clientId
  })

  return grant
}
