import { Transaction, TransactionOrKnex } from 'objection'
import { BaseService } from '../shared/baseService'
import { Subject } from './model'
import { SubjectRequest } from './types'
import { GrantError, GrantErrorCode } from '../grant/errors'

export interface SubjectService {
  createSubject(
    grantId: string,
    subjectRequests: SubjectRequest[],
    trx?: Transaction
  ): Promise<Subject[]>
  getByGrant(grantId: string, trx?: Transaction): Promise<Subject[]>
}

interface ServiceDependencies extends BaseService {
  knex: TransactionOrKnex
}

export async function createSubjectService({
  logger,
  knex
}: ServiceDependencies): Promise<SubjectService> {
  const log = logger.child({
    service: 'SubjectService'
  })

  const deps: ServiceDependencies = {
    logger: log,
    knex
  }

  return {
    createSubject: (
      grantId: string,
      subjectRequests: SubjectRequest[],
      trx?: Transaction
    ) => createSubject(deps, grantId, subjectRequests, trx),
    getByGrant: (grantId: string, trx?: Transaction) =>
      getByGrant(deps, grantId, trx)
  }
}

async function createSubject(
  deps: ServiceDependencies,
  grantId: string,
  subjectRequests: SubjectRequest[],
  trx?: Transaction
): Promise<Subject[]> {
  const subjectRequestsWithGrant = subjectRequests.map((subject) => {
    validateSubjectRequest(subject)
    return { grantId, subId: subject.id, subIdFormat: subject.format }
  })

  return Subject.query(trx || deps.knex).insert(subjectRequestsWithGrant)
}

async function getByGrant(
  deps: ServiceDependencies,
  grantId: string,
  trx?: Transaction
): Promise<Subject[]> {
  return Subject.query(trx || deps.knex).where({ grantId })
}

function validateSubjectRequest(subject: SubjectRequest): void {
  try {
    new URL(subject.id)
  } catch {
    throw new GrantError(
      GrantErrorCode.InvalidRequest,
      'subject id must be a valid https url'
    )
  }
  if (subject.format !== 'uri') {
    throw new GrantError(
      GrantErrorCode.InvalidRequest,
      'subject format is invalid'
    )
  }
}
