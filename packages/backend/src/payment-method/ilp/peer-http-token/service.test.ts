import { v4 as uuid } from 'uuid'

import { HttpTokenService } from './service'
import { HttpTokenError } from './errors'
import { createTestApp, TestContainer } from '../../../tests/app'
import { createPeer } from '../../../tests/peer'
import { truncateTables } from '../../../tests/tableManager'
import { Config } from '../../../config/app'
import { IocContract } from '@adonisjs/fold'
import { initIocContainer } from '../../..'
import { AppServices } from '../../../app'
import { Peer } from '../peer/model'

describe('HTTP Token Service', (): void => {
  let deps: IocContract<AppServices>
  let appContainer: TestContainer
  let httpTokenService: HttpTokenService
  let peer: Peer

  beforeAll(async (): Promise<void> => {
    deps = await initIocContainer(Config)
    appContainer = await createTestApp(deps)
    httpTokenService = await deps.use('httpTokenService')
  })

  beforeEach(async (): Promise<void> => {
    peer = await createPeer(deps)
  })

  afterEach(async (): Promise<void> => {
    await truncateTables(deps)
  })

  afterAll(async (): Promise<void> => {
    await appContainer.shutdown()
  })

  describe('Create or Get Tokens', (): void => {
    test('Tokens can be created and fetched', async (): Promise<void> => {
      const httpToken = {
        peerId: peer.id,
        token: uuid()
      }
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpToken.token)
      ).resolves.toMatchObject({
        ...httpToken,
        peer
      })

      const httpTokens = [
        {
          peerId: peer.id,
          token: uuid()
        },
        {
          peerId: peer.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toMatchObject({
        ...httpTokens[0],
        peer
      })
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toMatchObject({
        ...httpTokens[1],
        peer
      })
    })

    test('Cannot create token with unknown peer', async (): Promise<void> => {
      const httpToken = {
        peerId: uuid(),
        token: uuid()
      }
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.UnknownPeer
      )
    })

    test('Cannot create duplicate tokens', async (): Promise<void> => {
      const token = uuid()
      const httpTokens = [
        {
          peerId: peer.id,
          token
        },
        {
          peerId: peer.id,
          token
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
    })

    test('Cannot create duplicate token for same peer', async (): Promise<void> => {
      const httpToken = {
        peerId: peer.id,
        token: uuid()
      }
      await expect(
        httpTokenService.create([httpToken])
      ).resolves.toBeUndefined()
      await expect(httpTokenService.create([httpToken])).resolves.toEqual(
        HttpTokenError.DuplicateToken
      )
    })

    test('Cannot create duplicate token for different peer', async (): Promise<void> => {
      const token = uuid()
      await expect(
        httpTokenService.create([
          {
            peerId: peer.id,
            token
          }
        ])
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.create([
          {
            peerId: (await createPeer(deps)).id,
            token
          }
        ])
      ).resolves.toEqual(HttpTokenError.DuplicateToken)
    })
  })

  describe('Delete Tokens', (): void => {
    test('Tokens can be deleted by peer id', async (): Promise<void> => {
      const httpTokens = [
        {
          peerId: peer.id,
          token: uuid()
        },
        {
          peerId: peer.id,
          token: uuid()
        }
      ]
      await expect(httpTokenService.create(httpTokens)).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toBeDefined()
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toBeDefined()
      await expect(
        httpTokenService.deleteByPeer(peer.id)
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[0].token)
      ).resolves.toBeUndefined()
      await expect(
        httpTokenService.get(httpTokens[1].token)
      ).resolves.toBeUndefined()
    })
  })
})
