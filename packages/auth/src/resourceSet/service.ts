import { AccessRequest } from '../access/types'
import { JWKWithRequired } from '../client/service'

import { BaseService } from '../shared/baseService'
import { AccessService } from '../access/service'
import { ResourceSet } from './model'

interface ServiceDependencies extends BaseService {
  accessService: AccessService
}

interface ResourceSetRequest {
  access?: AccessRequest[]
  key?: {
    proof: string
    jwk: JWKWithRequired
  }
}

export interface ResourceSetService {
  create(req: ResourceSetRequest): Promise<ResourceSet>
}

export async function createResourceSetService({
  logger,
  accessService
}: ServiceDependencies): Promise<ResourceSetService> {
  const log = logger.child({
    service: 'ResourceSetService'
  })

  const deps = {
    logger: log,
    accessService
  }

  return {
    create: (req: ResourceSetRequest) => create(deps, req)
  }
}

async function create(
  deps: ServiceDependencies,
  req: ResourceSetRequest
): Promise<ResourceSet> {
  const trx = await ResourceSet.startTransaction()
  try {
    const resourceSet = await ResourceSet.query(trx).insertAndFetch({
      keyProof: req.key?.proof,
      keyJwk: req.key?.jwk
    })

    if (req.access) {
      await deps.accessService.createAccessForResourceSet(
        resourceSet.id,
        req.access,
        trx
      )
    }

    await trx.commit()
    return resourceSet
  } catch (err) {
    await trx.rollback()
    throw err
  }
}
