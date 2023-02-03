import assert from 'assert'
import { v4 as uuid } from 'uuid'
import { connectionMiddleware, ConnectionContext } from './middleware'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { createTestApp, TestContainer } from '../../tests/app'
import { createAsset } from '../../tests/asset'
import { createContext } from '../../tests/context'
import { createIncomingPayment } from '../../tests/incomingPayment'
import { createPaymentPointer } from '../../tests/paymentPointer'
import { truncateTables } from '../../tests/tableManager'

describe('Connection Middleware', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let ctx: ConnectionContext
  let next: jest.MockedFunction<() => Promise<void>>

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
  })

  beforeEach((): void => {
    ctx = createContext<ConnectionContext>(
      {
        headers: {
          Accept: 'application/json'
        }
      },
      {}
    )
    ctx.container = deps
    next = jest.fn()
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  test('returns 404 for unknown connection id', async (): Promise<void> => {
    ctx.params.id = uuid()
    await expect(connectionMiddleware(ctx, next)).rejects.toMatchObject({
      status: 404,
      message: 'Not Found'
    })
    expect(next).not.toHaveBeenCalled()
  })

  test('sets the context incomingPayment and calls next', async (): Promise<void> => {
    const asset = await createAsset(deps)
    const { id: paymentPointerId } = await createPaymentPointer(deps, {
      assetId: asset.id
    })
    const incomingPayment = await createIncomingPayment(deps, {
      paymentPointerId
    })
    assert.ok(incomingPayment.connectionId)
    ctx.params.id = incomingPayment.connectionId
    await expect(connectionMiddleware(ctx, next)).resolves.toBeUndefined()
    expect(next).toHaveBeenCalled()
    expect(ctx.incomingPayment).toEqual(incomingPayment)
  })
})
