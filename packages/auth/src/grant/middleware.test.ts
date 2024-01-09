import { v4 } from 'uuid'
import { Knex } from 'knex'
import { IocContract } from '@adonisjs/fold'
import { AccessType, AccessAction } from '@interledger/open-payments'

import { initIocContainer } from '..'
import { createTestApp, TestContainer } from '../tests/app'
import { Config } from '../config/app'
import { AppServices } from '../app'
import { truncateTables } from '../tests/tableManager'

import { Grant, GrantState } from './model'
import { ContinueContext } from './routes'
import { Interaction, InteractionState } from '../interaction/model'
import { Access } from '../access/model'
import { createContext } from '../tests/context'
import { generateBaseGrant } from '../tests/grant'
import { generateBaseInteraction } from '../tests/interaction'
import { grantLastContinueAttemptMiddleware } from './middleware'

const BASE_GRANT_ACCESS = {
  type: AccessType.IncomingPayment,
  actions: [AccessAction.Create, AccessAction.Read, AccessAction.List],
  identifier: `https://example.com/${v4()}`
}

describe('Grant middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let grant: Grant
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let next: () => Promise<any>
  let trx: Knex.Transaction

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach(async (): Promise<void> => {
    grant = await Grant.query(trx).insert(
      generateBaseGrant({
        state: GrantState.Approved
      })
    )

    await Access.query(trx).insert({
      ...BASE_GRANT_ACCESS,
      grantId: grant.id
    })

    await Interaction.query(trx).insert(
      generateBaseInteraction(grant, {
        state: InteractionState.Approved
      })
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    next = jest.fn(async function (): Promise<any> {
      return null
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })
  test('Update grant continuation attempt time with middleware', async (): Promise<void> => {
    const ctx = createContext<ContinueContext>(
      {
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `GNAP ${grant.continueToken}`
        },
        url: `/continue/${grant.continueId}`,
        method: 'POST'
      },
      {
        id: grant.continueId
      },
      deps
    )

    await grantLastContinueAttemptMiddleware(ctx, next)
    expect(next).toHaveBeenCalled()
    expect(ctx.response.status).toEqual(200)

    const updatedGrant = await Grant.query(trx).findById(grant.id)
    expect(updatedGrant?.lastContinuedAt.getTime()).toBeGreaterThan(
      grant.lastContinuedAt.getTime()
    )
  })
})
