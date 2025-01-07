import { generateJwk } from '@interledger/http-signature-utils'
import { v4 as uuid } from 'uuid'

import { WalletAddressKeyService } from './service'
import { createTestApp, TestContainer } from '../../../tests/app'
import { truncateTables } from '../../../tests/tableManager'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { createWalletAddress } from '../../../tests/walletAddress'
import { getPageTests } from '../../../shared/baseModel.test'
import { createWalletAddressKey } from '../../../tests/walletAddressKey'
import { WalletAddress } from '../model'
import { Pagination, SortOrder } from '../../../shared/baseModel'

const TEST_KEY = generateJwk({ keyId: uuid() })

describe('Wallet Address Key Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let walletAddress: WalletAddress
  let walletAddressKeyService: WalletAddressKeyService

  beforeAll(async (): Promise<void> => {
    deps = initIocContainer(Config)
    appContainer = await createTestApp(deps)
    walletAddressKeyService = await deps.use('walletAddressKeyService')
  })

  beforeEach(async (): Promise<void> => {
    walletAddress = await createWalletAddress(deps, {
      tenantId: Config.operatorTenantId
    })
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(appContainer.knex)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('create', (): void => {
    test('adds a key to a wallet address', async (): Promise<void> => {
      const options = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      await expect(
        walletAddressKeyService.create(options)
      ).resolves.toMatchObject(options)
    })
  })

  describe('Fetch Wallet Address Keys', (): void => {
    test('Can fetch keys by wallet address id', async (): Promise<void> => {
      const keyOption = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      const key = await walletAddressKeyService.create(keyOption)
      await expect(
        walletAddressKeyService.getKeysByWalletAddressId(walletAddress.id)
      ).resolves.toEqual([key])
    })

    test('Fetching Only Retrieves Non-Revoked Keys for a Wallet Address', async (): Promise<void> => {
      const keyOption1 = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      const keyOption2 = {
        walletAddressId: walletAddress.id,
        jwk: generateJwk({ keyId: uuid() })
      }

      const key1 = await walletAddressKeyService.create(keyOption1)
      const key2 = await walletAddressKeyService.create(keyOption2)
      await walletAddressKeyService.revoke(key1.id)

      await expect(
        walletAddressKeyService.getKeysByWalletAddressId(walletAddress.id)
      ).resolves.toEqual([key2])
    })

    describe('Wallet Address Keys pagination', (): void => {
      getPageTests({
        createModel: () => createWalletAddressKey(deps, walletAddress.id),
        getPage: (pagination?: Pagination, sortOrder?: SortOrder) =>
          walletAddressKeyService.getPage(
            walletAddress.id,
            pagination,
            sortOrder
          )
      })
    })
  })

  describe('Revoke Wallet Address Keys', (): void => {
    test('Can revoke a key', async (): Promise<void> => {
      const keyOption = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      const key = await walletAddressKeyService.create(keyOption)
      const revokedKey = await walletAddressKeyService.revoke(key.id)
      expect(revokedKey).toEqual({
        ...key,
        revoked: true,
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        updatedAt: revokedKey!.updatedAt
      })
    })

    test('Returns undefined if key does not exist', async (): Promise<void> => {
      await expect(
        walletAddressKeyService.revoke(uuid())
      ).resolves.toBeUndefined()
    })

    test('Returns key if key is already revoked', async (): Promise<void> => {
      const keyOption = {
        walletAddressId: walletAddress.id,
        jwk: TEST_KEY
      }

      const key = await walletAddressKeyService.create(keyOption)

      const revokedKey = await walletAddressKeyService.revoke(key.id)
      await expect(walletAddressKeyService.revoke(key.id)).resolves.toEqual(
        revokedKey
      )
    })
  })
})
