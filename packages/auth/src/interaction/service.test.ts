import { faker } from '@faker-js/faker'
import { v4 } from 'uuid'
import { IocContract } from '@adonisjs/fold'
import assert from 'assert'

import { AccessType, AccessAction } from '@interledger/open-payments'

import { truncateTables } from '../tests/tableManager'
import { generateBaseGrant } from '../tests/grant'
import { createTestApp, TestContainer } from '../tests/app'
import { AppServices } from '../app'
import { Config } from '../config/app'
import { initIocContainer } from '../'
import { Grant, StartMethod, FinishMethod, GrantState } from '../grant/model'
import { Access } from '../access/model'

import { Interaction, InteractionState } from './model'
import { InteractionService } from './service'
import { generateNonce, generateToken } from '../shared/utils'
import { Tenant } from '../tenant/model'
import { generateTenant } from '../tests/tenant'

const CLIENT = faker.internet.url({ appendSlash: false })
const BASE_GRANT_ACCESS = {
  actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
  identifier: `https://example.com/${v4()}`
}

describe('Interaction Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let interactionService: InteractionService
  let interaction: Interaction
  let grant: Grant
  let tenant: Tenant

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)

    interactionService = await deps.use('interactionService')
  })

  beforeEach(async (): Promise<void> => {
    tenant = await Tenant.query().insert(generateTenant())
    grant = await Grant.query().insert({
      state: GrantState.Processing,
      startMethod: [StartMethod.Redirect],
      continueToken: generateToken(),
      continueId: v4(),
      finishMethod: FinishMethod.Redirect,
      finishUri: 'https://example.com',
      clientNonce: generateNonce(),
      client: CLIENT,
      tenantId: tenant.id
    })

    interaction = await Interaction.query().insert({
      ref: v4(),
      nonce: generateNonce(),
      state: InteractionState.Pending,
      expiresIn: Config.interactionExpirySeconds,
      grantId: grant.id
    })

    await Access.query().insert({
      ...BASE_GRANT_ACCESS,
      type: AccessType.IncomingPayment,
      grantId: grant.id
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('can create an interaction', async (): Promise<void> => {
      const grant = await Grant.query().insert(
        generateBaseGrant({ tenantId: tenant.id })
      )

      const interaction = await interactionService.create(grant.id)

      expect(interaction).toMatchObject({
        id: expect.any(String),
        ref: expect.any(String),
        nonce: expect.any(String),
        state: InteractionState.Pending,
        grantId: grant.id,
        expiresIn: Config.interactionExpirySeconds
      })
    })
  })

  describe('getBySession', (): void => {
    test('can get an interaction by session info', async (): Promise<void> => {
      const retrievedInteraction = await interactionService.getBySession(
        interaction.id,
        interaction.nonce
      )

      assert.ok(retrievedInteraction)
      expect(retrievedInteraction.id).toEqual(interaction.id)
      expect(retrievedInteraction.nonce).toEqual(interaction.nonce)
    })

    test('Cannot retrieve an interaction when the id does not match', async (): Promise<void> => {
      const retrievedInteraction = await interactionService.getBySession(
        v4(),
        interaction.nonce
      )
      expect(retrievedInteraction).toBeUndefined()
    })

    test('Cannot retrieve an interaction when the nonce does not match', async (): Promise<void> => {
      const retrievedInteraction = await interactionService.getBySession(
        interaction.id,
        generateNonce()
      )
      expect(retrievedInteraction).toBeUndefined()
    })
  })

  describe('getByRef', (): void => {
    test('can get an interaction by its reference', async (): Promise<void> => {
      const retrievedInteraction = await interactionService.getByRef(
        interaction.ref
      )

      assert.ok(retrievedInteraction)
      expect(retrievedInteraction.id).toEqual(interaction.id)
      expect(retrievedInteraction.ref).toEqual(interaction.ref)
    })
  })

  describe('approve', (): void => {
    test('can approve an interaction', async (): Promise<void> => {
      const approvedInteraction = await interactionService.approve(
        interaction.id
      )

      assert.ok(approvedInteraction)
      expect(approvedInteraction.id).toEqual(interaction.id)
      expect(approvedInteraction.state).toEqual(InteractionState.Approved)
    })
  })

  describe('deny', (): void => {
    test('can deny an interaction', async (): Promise<void> => {
      const deniedInteraction = await interactionService.deny(interaction.id)

      assert.ok(deniedInteraction)
      expect(deniedInteraction.id).toEqual(interaction.id)
      expect(deniedInteraction.state).toEqual(InteractionState.Denied)
    })
  })
})
