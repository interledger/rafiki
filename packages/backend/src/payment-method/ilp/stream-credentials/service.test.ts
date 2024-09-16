import { Knex } from 'knex'
import { faker } from '@faker-js/faker'
import { v4 as uuid } from 'uuid'
import { createTestApp, TestContainer } from '../../../tests/app'
import { StreamCredentialsService } from './service'
import { IncomingPayment } from '../../../open_payments/payment/incoming/model'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createIncomingPayment } from '../../../tests/incomingPayment'
import { createWalletAddress } from '../../../tests/walletAddress'
import { truncateTables } from '../../../tests/tableManager'
import assert from 'assert'
import { IncomingPaymentState } from '../../../graphql/generated/graphql'
import { createTenant } from '../../../tests/tenant'
import { EndpointType } from '../../../tenant/endpoints/model'

const nock = (global as unknown as { nock: typeof import('nock') }).nock

describe('Stream Credentials Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let streamCredentialsService: StreamCredentialsService
  let knex: Knex
  let incomingPayment: IncomingPayment

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    streamCredentialsService = await deps.use('streamCredentialsService')
    knex = appContainer.knex
  })

  beforeEach(async (): Promise<void> => {
    const config = await deps.use('config')
    const tenantEmail = faker.internet.email()
    nock(config.kratosAdminUrl)
      .get('/identities')
      .query({ credentials_identifier: tenantEmail })
      .reply(200, [{ id: uuid(), metadata_public: {} }])
      .persist()
    const tenantId = (
      await createTenant(deps, {
        email: tenantEmail,
        idpSecret: 'testsecret',
        idpConsentEndpoint: faker.internet.url(),
        endpoints: [
          { type: EndpointType.WebhookBaseUrl, value: faker.internet.url() }
        ]
      })
    ).id
    const { id: walletAddressId } = await createWalletAddress(deps, tenantId)
    incomingPayment = await createIncomingPayment(deps, {
      walletAddressId,
      tenantId
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('get', (): void => {
    test('returns stream credentials for incoming payment', (): void => {
      const credentials = streamCredentialsService.get(incomingPayment)
      assert.ok(credentials)
      expect(credentials).toMatchObject({
        ilpAddress: expect.stringMatching(/^test\.rafiki\.[a-zA-Z0-9_-]{95}$/),
        sharedSecret: expect.any(Buffer)
      })
    })

    test.each`
      state
      ${IncomingPaymentState.Completed}
      ${IncomingPaymentState.Expired}
    `(
      `returns undefined for $state incoming payment`,
      async ({ state }): Promise<void> => {
        await incomingPayment.$query(knex).patch({
          state,
          expiresAt:
            state === IncomingPaymentState.Expired ? new Date() : undefined
        })
        expect(streamCredentialsService.get(incomingPayment)).toBeUndefined()
      }
    )
  })
})
