import { faker } from '@faker-js/faker'
import nock from 'nock'
import { v4 } from 'uuid'
import { createTestApp, TestContainer } from '../tests/app'
import { truncateTables } from '../tests/tableManager'
import { Config } from '../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../'
import { AppServices } from '../app'
import { SubjectService } from './service'
import { Grant, GrantState, StartMethod, FinishMethod } from '../grant/model'
import { SubjectRequest } from './types'
import { generateNonce, generateToken } from '../shared/utils'
import { Subject } from './model'
import { TransactionOrKnex } from 'objection'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

describe('Subject Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let subjectService: SubjectService
  let trx: TransactionOrKnex
  let grant: Grant

  const generateBaseGrant = () => ({
    state: GrantState.Pending,
    startMethod: [StartMethod.Redirect],
    continueToken: generateToken(),
    continueId: v4(),
    finishMethod: FinishMethod.Redirect,
    finishUri: 'https://example.com/finish',
    clientNonce: generateNonce(),
    client: faker.internet.url({ appendSlash: false })
  })

  beforeEach(async (): Promise<void> => {
    const tenant = await Tenant.query().insertAndFetch(generateTenant())
    grant = await Grant.query(trx).insertAndFetch({
      ...generateBaseGrant(),
      tenantId: tenant.id
    })
  })

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    subjectService = await deps.use('subjectService')
    trx = appContainer.knex
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    nock.restore()
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('Can create 1 subject', async (): Promise<void> => {
      const subjectRequest: SubjectRequest = {
        id: 'https://wallet.com/alice',
        format: 'uri'
      }

      const subject = await subjectService.createSubject(grant.id, [
        subjectRequest
      ])

      expect(subject.length).toEqual(1)
      expect(subject[0].grantId).toEqual(grant.id)
      expect(subject[0].subId).toEqual(subjectRequest.id)
      expect(subject[0].subIdFormat).toEqual(subjectRequest.format)
    })

    describe('validateSubjectRequest throws', (): void => {
      test('when id is not a valid URI', async (): Promise<void> => {
        const subjectRequest: SubjectRequest = {
          id: 'invalid-uri',
          format: 'uri'
        }

        await expect(
          subjectService.createSubject(grant.id, [subjectRequest])
        ).rejects.toThrow()
      })

      test('when format is not uri', async (): Promise<void> => {
        const subjectRequest: SubjectRequest = {
          id: faker.internet.url({ protocol: 'https' }),
          format: 'url'
        }

        await expect(
          subjectService.createSubject(grant.id, [subjectRequest])
        ).rejects.toThrow()
      })
    })
  })

  describe('getByGrant', (): void => {
    test('gets subject', async () => {
      const subject1 = {
        grantId: grant.id,
        subId: 'https://wallet.com/alice',
        subIdFormat: 'uri'
      }
      const subject2 = {
        grantId: grant.id,
        subId: 'https://wallet.com/bob',
        subIdFormat: 'uri'
      }
      await Subject.query(trx).insert([subject1, subject2])

      const fetchedSubjects = await subjectService.getByGrant(grant.id)

      expect(fetchedSubjects.length).toEqual(2)
      expect(fetchedSubjects[0].grantId).toEqual(grant.id)
      expect(fetchedSubjects[0].subId).toEqual(subject1.subId)
      expect(fetchedSubjects[0].subIdFormat).toEqual(subject1.subIdFormat)
      expect(fetchedSubjects[1].grantId).toEqual(grant.id)
      expect(fetchedSubjects[1].subId).toEqual(subject2.subId)
      expect(fetchedSubjects[1].subIdFormat).toEqual(subject2.subIdFormat)
    })
  })
})
