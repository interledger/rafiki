import assert from 'assert'
import Knex from 'knex'
import nock from 'nock'
import { WorkerUtils, makeWorkerUtils } from 'graphile-worker'
import { parse, end } from 'iso8601-duration'
import { v4 as uuid } from 'uuid'

import { MandateService } from './service'
import {
  CreateError,
  isCreateError,
  isRevokeError,
  RevokeError
} from './errors'
import { Mandate } from './model'
import { createTestApp, TestContainer } from '../../tests/app'
import { AccountService } from '../account/service'
import { resetGraphileDb } from '../../tests/graphileDb'
import { GraphileProducer } from '../../messaging/graphileProducer'
import { Config } from '../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../'
import { AppServices } from '../../app'
import { randomAsset } from '../../tests/asset'
import { truncateTables } from '../../tests/tableManager'

const DAY = 24 * 60 * 60 * 1000
const YEAR = 365 * DAY

describe('Mandate Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let workerUtils: WorkerUtils
  let mandateService: MandateService
  let accountService: AccountService
  let knex: Knex
  let accountId: string
  const messageProducer = new GraphileProducer()
  const mockMessageProducer = {
    send: jest.fn()
  }
  const { code: assetCode, scale: assetScale } = randomAsset()
  const prices = {
    [assetCode]: 1.0
  }
  const amount = BigInt(100)

  beforeAll(
    async (): Promise<void> => {
      Config.pricesUrl = 'https://test.prices'
      nock(Config.pricesUrl)
        .get('/')
        .reply(200, () => prices)
        .persist()
      deps = await initIocContainer(Config)
      deps.bind('messageProducer', async () => mockMessageProducer)
      appContainer = await createTestApp(deps)
      workerUtils = await makeWorkerUtils({
        connectionString: appContainer.connectionUrl
      })
      await workerUtils.migrate()
      messageProducer.setUtils(workerUtils)
      knex = await deps.use('knex')
      mandateService = await deps.use('mandateService')
      accountService = await deps.use('accountService')
    }
  )

  beforeEach(
    async (): Promise<void> => {
      const asset = randomAsset()
      accountId = (await accountService.create({ asset })).id
      prices[asset.code] = 2.0
    }
  )

  afterEach(
    async (): Promise<void> => {
      jest.restoreAllMocks()
      jest.useRealTimers()
      await truncateTables(knex)
    }
  )

  afterAll(
    async (): Promise<void> => {
      await resetGraphileDb(knex)
      await appContainer.shutdown()
      await workerUtils.release()
    }
  )

  describe('Create/Get Mandate', (): void => {
    describe.each`
      interval | expiresAt                      | expiring | description
      ${null}  | ${null}                        | ${false} | ${'single indefinite interval'}
      ${null}  | ${new Date(Date.now() + YEAR)} | ${true}  | ${'single expiring interval'}
      ${'P1M'} | ${null}                        | ${false} | ${'indefinite intervals'}
      ${'P2Y'} | ${new Date(Date.now() + YEAR)} | ${true}  | ${'expiresAt < interval'}
      ${'P1M'} | ${new Date(Date.now() + YEAR)} | ${false} | ${'interval < expiresAt'}
    `('$description', ({ interval, expiresAt, expiring }): void => {
      describe.each`
        startAt                       | active   | starting | description
        ${null}                       | ${true}  | ${false} | ${'start on create'}
        ${new Date(Date.now() + DAY)} | ${false} | ${true}  | ${'create pre-start'}
        ${new Date(Date.now() - DAY)} | ${true}  | ${false} | ${'create post-start'}
      `('$description', ({ startAt, active, starting }): void => {
        test('A mandate can be created and fetched', async (): Promise<void> => {
          const options = {
            accountId,
            amount,
            assetCode,
            assetScale,
            startAt,
            expiresAt,
            interval
          }
          const mandate = await mandateService.create(options)
          assert.ok(!isCreateError(mandate))
          let processAt: Date | undefined | null = null
          if (starting) {
            processAt = mandate.startAt
          } else if (expiring) {
            processAt = mandate.expiresAt
          } else if (mandate.interval) {
            processAt = end(
              parse(mandate.interval),
              mandate.startAt || mandate.createdAt
            )
          }
          expect(mandate).toMatchObject({
            ...options,
            id: mandate.id,
            account: await accountService.get(accountId),
            balance: active ? options.amount : BigInt(0),
            processAt,
            revoked: false
          })
          const retrievedMandate = await mandateService.get(mandate.id)
          if (!retrievedMandate) throw new Error('mandate not found')
          expect(retrievedMandate).toEqual(mandate)
        })

        test('Cannot create mandate for nonexistent account', async (): Promise<void> => {
          await expect(
            mandateService.create({
              accountId: uuid(),
              amount,
              assetCode,
              assetScale
            })
          ).resolves.toEqual(CreateError.UnknownAccount)
        })

        test('Cannot create mandate for unknown asset', async (): Promise<void> => {
          const { code: assetCode } = randomAsset()
          await expect(
            mandateService.create({
              accountId: uuid(),
              amount,
              assetCode,
              assetScale
            })
          ).resolves.toEqual(CreateError.UnknownAsset)
        })

        if (expiring) {
          test('Cannot create expired mandate', async (): Promise<void> => {
            await expect(
              mandateService.create({
                accountId: uuid(),
                amount,
                assetCode,
                assetScale,
                expiresAt: new Date(Date.now() - 1)
              })
            ).resolves.toEqual(CreateError.InvalidExpiresAt)
          })
        }

        if (interval) {
          test('Cannot create mandate with invalid interval', async (): Promise<void> => {
            await expect(
              mandateService.create({
                accountId: uuid(),
                amount,
                assetCode,
                assetScale,
                interval: 'fail'
              })
            ).resolves.toEqual(CreateError.InvalidInterval)
          })
        }
      })
    })

    test('Cannot fetch a bogus mandate', async (): Promise<void> => {
      await expect(mandateService.get(uuid())).resolves.toBeUndefined()
    })
  })

  describe('processNext', (): void => {
    describe.each`
      interval | expiresAt                      | expiring | description
      ${null}  | ${null}                        | ${false} | ${'single indefinite interval'}
      ${null}  | ${new Date(Date.now() + YEAR)} | ${true}  | ${'single expiring interval'}
      ${'P1M'} | ${null}                        | ${false} | ${'indefinite intervals'}
      ${'P2Y'} | ${new Date(Date.now() + YEAR)} | ${true}  | ${'<1 full interval'}
      ${'P9M'} | ${new Date(Date.now() + YEAR)} | ${false} | ${'expire 2nd interval'}
      ${'P1M'} | ${new Date(Date.now() + YEAR)} | ${false} | ${'2+ full intervals'}
    `('$description', ({ interval, expiresAt, expiring }): void => {
      let mandate: Mandate

      describe('activate', (): void => {
        beforeEach(
          async (): Promise<void> => {
            const startAt = new Date(Date.now() + DAY)
            mandate = (await mandateService.create({
              accountId,
              amount,
              assetCode,
              assetScale,
              startAt,
              expiresAt,
              interval
            })) as Mandate
            assert.ok(!isCreateError(mandate))
            expect(mandate).toMatchObject({
              revoked: false,
              balance: BigInt(0),
              processAt: startAt
            })
          }
        )

        test('Activates a starting mandate', async (): Promise<void> => {
          jest.useFakeTimers('modern')
          jest.setSystemTime(mandate.startAt)
          await expect(mandateService.processNext()).resolves.toBe(mandate.id)
          await expect(mandateService.get(mandate.id)).resolves.toMatchObject({
            revoked: false,
            balance: mandate.amount,
            processAt: expiring
              ? expiresAt
              : interval
              ? end(parse(interval), mandate.startAt)
              : null
          })
        })

        test('Does not activate a mandate prior to startAt', async (): Promise<void> => {
          await expect(mandateService.processNext()).resolves.toBeUndefined()
          await expect(mandateService.get(mandate.id)).resolves.toEqual(mandate)
        })
      })

      describe.each`
        balance       | description
        ${amount}     | ${'unused'}
        ${BigInt(50)} | ${'partial'}
        ${BigInt(0)}  | ${'empty'}
      `('$description balance', ({ balance }): void => {
        beforeEach(
          async (): Promise<void> => {
            mandate = (await mandateService.create({
              accountId,
              amount,
              assetCode,
              assetScale,
              expiresAt,
              interval
            })) as Mandate
            assert.ok(!isCreateError(mandate))
            await mandate.$query(knex).patch({ balance })
            expect(mandate).toMatchObject({
              revoked: false,
              balance
            })
          }
        )

        if (expiring) {
          test('Deactivates an expired mandate', async (): Promise<void> => {
            assert.ok(mandate.processAt)
            jest.useFakeTimers('modern')
            jest.setSystemTime(mandate.processAt)
            await expect(mandateService.processNext()).resolves.toBe(mandate.id)
            await expect(mandateService.get(mandate.id)).resolves.toMatchObject(
              {
                revoked: false,
                balance: BigInt(0),
                processAt: null
              }
            )
          })
        } else if (interval) {
          test('Starts new interval', async (): Promise<void> => {
            assert.ok(mandate.processAt)
            jest.useFakeTimers('modern')
            jest.setSystemTime(mandate.processAt)
            await expect(mandateService.processNext()).resolves.toBe(mandate.id)
            const fullInterval = end(parse(interval), mandate.processAt)
            await expect(mandateService.get(mandate.id)).resolves.toMatchObject(
              {
                revoked: false,
                balance: mandate.amount,
                processAt:
                  expiresAt && expiresAt < fullInterval
                    ? expiresAt
                    : fullInterval
              }
            )
          })
        }

        test('Does not process a mandate mid-interval', async (): Promise<void> => {
          await expect(mandateService.processNext()).resolves.toBeUndefined()
          await expect(mandateService.get(mandate.id)).resolves.toEqual(mandate)
        })
      })
    })
  })

  describe('revoke', (): void => {
    test.each`
      startAt                       | state
      ${null}                       | ${'activated'}
      ${new Date(Date.now() + DAY)} | ${'unactivated'}
    `(
      'Revokes an $state mandate',
      async ({ startAt }): Promise<void> => {
        const mandate = await mandateService.create({
          accountId,
          amount,
          assetCode,
          assetScale,
          startAt
        })
        assert.ok(!isCreateError(mandate))
        const revoked = await mandateService.revoke(mandate.id)
        expect(isRevokeError(revoked)).toBe(false)
        expect(revoked).toMatchObject({
          id: mandate.id,
          revoked: true,
          balance: BigInt(0),
          processAt: null
        })
        await expect(mandateService.get(mandate.id)).resolves.toEqual(revoked)
      }
    )

    test('Returns error for unknown mandate', async (): Promise<void> => {
      await expect(mandateService.revoke(uuid())).resolves.toEqual(
        RevokeError.UnknownMandate
      )
    })

    test('Returns error for expired mandate', async (): Promise<void> => {
      const expiresAt = new Date(Date.now() + YEAR)
      const mandate = await mandateService.create({
        accountId,
        amount,
        assetCode,
        assetScale,
        expiresAt
      })
      assert.ok(!isCreateError(mandate))
      jest.useFakeTimers('modern')
      jest.setSystemTime(expiresAt)
      await expect(mandateService.processNext()).resolves.toBe(mandate.id)
      const expired = await mandateService.get(mandate.id)
      await expect(mandateService.revoke(mandate.id)).resolves.toEqual(
        RevokeError.AlreadyExpired
      )
      await expect(mandateService.get(mandate.id)).resolves.toEqual(expired)
    })

    test('Returns error for revoked mandate', async (): Promise<void> => {
      const mandate = await mandateService.create({
        accountId,
        amount,
        assetCode,
        assetScale
      })
      assert.ok(!isCreateError(mandate))
      const revoked = await mandateService.revoke(mandate.id)
      expect(isRevokeError(revoked)).toBe(false)
      await expect(mandateService.revoke(mandate.id)).resolves.toEqual(
        RevokeError.AlreadyRevoked
      )
      await expect(mandateService.get(mandate.id)).resolves.toEqual(revoked)
    })
  })

  describe('Mandate pagination', (): void => {
    let mandatesCreated: Mandate[]

    beforeEach(
      async (): Promise<void> => {
        mandatesCreated = []
        for (let i = 0; i < 40; i++) {
          const mandate = await mandateService.create({
            accountId,
            amount,
            assetCode,
            assetScale
          })
          assert.ok(!isCreateError(mandate))
          mandatesCreated.push(mandate)
        }
      }
    )

    test('Defaults to fetching first 20 items', async (): Promise<void> => {
      const mandates = await mandateService.getAccountMandatesPage(accountId)
      expect(mandates).toHaveLength(20)
      expect(mandates[0].id).toEqual(mandatesCreated[0].id)
      expect(mandates[19].id).toEqual(mandatesCreated[19].id)
      expect(mandates[20]).toBeUndefined()
    })

    test('Can change forward pagination limit', async (): Promise<void> => {
      const pagination = {
        first: 10
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(10)
      expect(mandates[0].id).toEqual(mandatesCreated[0].id)
      expect(mandates[9].id).toEqual(mandatesCreated[9].id)
      expect(mandates[10]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor', async (): Promise<void> => {
      const pagination = {
        after: mandatesCreated[19].id
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(20)
      expect(mandates[0].id).toEqual(mandatesCreated[20].id)
      expect(mandates[19].id).toEqual(mandatesCreated[39].id)
      expect(mandates[20]).toBeUndefined()
    })

    test('Can paginate forwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        first: 10,
        after: mandatesCreated[9].id
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(10)
      expect(mandates[0].id).toEqual(mandatesCreated[10].id)
      expect(mandates[9].id).toEqual(mandatesCreated[19].id)
      expect(mandates[10]).toBeUndefined()
    })

    test("Can't change backward pagination limit on it's own.", async (): Promise<void> => {
      const pagination = {
        last: 10
      }
      const mandates = mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      await expect(mandates).rejects.toThrow(
        "Can't paginate backwards from the start."
      )
    })

    test('Can paginate backwards from a cursor', async (): Promise<void> => {
      const pagination = {
        before: mandatesCreated[20].id
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(20)
      expect(mandates[0].id).toEqual(mandatesCreated[0].id)
      expect(mandates[19].id).toEqual(mandatesCreated[19].id)
      expect(mandates[20]).toBeUndefined()
    })

    test('Can paginate backwards from a cursor with a limit', async (): Promise<void> => {
      const pagination = {
        last: 5,
        before: mandatesCreated[10].id
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(5)
      expect(mandates[0].id).toEqual(mandatesCreated[5].id)
      expect(mandates[4].id).toEqual(mandatesCreated[9].id)
      expect(mandates[5]).toBeUndefined()
    })

    test('Backwards/Forwards pagination results in same order.', async (): Promise<void> => {
      const paginationForwards = {
        first: 10
      }
      const mandatesForwards = await mandateService.getAccountMandatesPage(
        accountId,
        paginationForwards
      )
      const paginationBackwards = {
        last: 10,
        before: mandatesCreated[10].id
      }
      const mandatesBackwards = await mandateService.getAccountMandatesPage(
        accountId,
        paginationBackwards
      )
      expect(mandatesForwards).toHaveLength(10)
      expect(mandatesBackwards).toHaveLength(10)
      expect(mandatesForwards).toEqual(mandatesBackwards)
    })

    test('Providing before and after results in forward pagination', async (): Promise<void> => {
      const pagination = {
        after: mandatesCreated[19].id,
        before: mandatesCreated[19].id
      }
      const mandates = await mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      expect(mandates).toHaveLength(20)
      expect(mandates[0].id).toEqual(mandatesCreated[20].id)
      expect(mandates[19].id).toEqual(mandatesCreated[39].id)
      expect(mandates[20]).toBeUndefined()
    })

    test("Can't request less than 0 mandates", async (): Promise<void> => {
      const pagination = {
        first: -1
      }
      const mandates = mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      await expect(mandates).rejects.toThrow('Pagination index error')
    })

    test("Can't request more than 100 mandates", async (): Promise<void> => {
      const pagination = {
        first: 101
      }
      const mandates = mandateService.getAccountMandatesPage(
        accountId,
        pagination
      )
      await expect(mandates).rejects.toThrow('Pagination index error')
    })
  })
})
