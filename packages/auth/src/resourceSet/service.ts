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

export async function createResourceSetService(
  deps: ServiceDependencies
): Promise<ResourceSetService> {
  return {
    create: (req: ResourceSetRequest) => create(deps, req)
  }
}

async function create(
  deps: ServiceDependencies,
  req: ResourceSetRequest
): Promise<ResourceSet> {
  const resourceSet = await ResourceSet.query().insertAndFetch({
    keyProof: req.key?.proof,
    keyJwk: req.key?.jwk
  })

  if (req.access) {
    await deps.accessService.createAccessForResourceSet(
      resourceSet.id,
      req.access
    )
  }

  return resourceSet
}
