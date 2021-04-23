import { AccountingSystem } from '../src'
import {
  AccountSnapshot,
  InMemoryAccountsService,
  InMemoryPeers
} from '@interledger/rafiki-core'
import {
  IlpPrepareFactory,
  IlpFulfillFactory
} from '@interledger/rafiki-core/build/factories'
import {
  InMemorySettlementEngineService,
  RemoteSettlementEngine,
  SettlementResponse
} from '../src/services/settlement-engine'
import { IlpPrepare } from 'ilp-packet'

describe('Accounting System Test', () => {
  let accounts: InMemoryAccountsService
  let peers: InMemoryPeers
  let settlementEnginesService: InMemorySettlementEngineService
  let settlementEngine: RemoteSettlementEngine
  let accounting: AccountingSystem

  beforeEach(async () => {
    accounts = new InMemoryAccountsService()
    peers = new InMemoryPeers()
    settlementEnginesService = new InMemorySettlementEngineService()
    settlementEngine = new RemoteSettlementEngine('http://localhost:3001')
    accounting = new AccountingSystem({
      peers: peers,
      accounts: accounts,
      settlementEngines: settlementEnginesService
    })
    await settlementEnginesService.add('xrp', settlementEngine)
    accounts.add({
      id: 'alice',
      peerId: 'alice',
      assetCode: 'XRP',
      assetScale: 9,
      maximumPayable: 500n,
      maximumReceivable: 0n,
      settlementEngine: 'xrp',
      settlementThreshold: 200n,
      settleTo: 0n
    })
  })

  afterEach(async () => {
    await accounting.shutdown()
  })

  describe('Accounts', () => {
    beforeEach(async () => {
      await accounting.listen()
    })

    it('Adding an account calls out to accounts SE', async () => {
      const mockAddAccount = jest.fn().mockImplementation((id: string) => {})
      settlementEngine.addAccount = mockAddAccount
      await accounting.addAccount('alice')

      expect(mockAddAccount.mock.calls[0][0]).toBe('alice')
    })

    it('Adding an account calls for an SE that doesnt exist throws and error', async () => {
      const mockAddAccount = jest.fn().mockImplementation((id: string) => {
        expect(id === 'alice')
      })
      accounts.add({
        id: 'bob',
        peerId: 'bob',
        assetCode: 'XRP',
        assetScale: 6,
        maximumPayable: 0n,
        maximumReceivable: 0n,
        settlementEngine: 'unknown'
      })
      settlementEngine.addAccount = mockAddAccount

      await expect(accounting.addAccount('bob')).rejects.toThrow()
    })

    it('Removing an account calls out to remove from SE', async () => {
      const mockRemoveAccount = jest.fn().mockImplementation((id: string) => {})

      settlementEngine.removeAccount = mockRemoveAccount
      await accounting.removeAccount('alice')

      expect(mockRemoveAccount.mock.calls[0][0]).toBe('alice')
    })

    it('Removing an account calls for an SE that doesnt exist throws and error', async () => {
      const mockRemoveAccount = jest.fn().mockImplementation((id: string) => {})
      accounts.add({
        id: 'bob',
        peerId: 'bob',
        assetCode: 'XRP',
        assetScale: 6,
        maximumPayable: 0n,
        maximumReceivable: 0n,
        settlementEngine: 'unknown'
      })

      settlementEngine.removeAccount = mockRemoveAccount

      await expect(accounting.removeAccount('bob')).rejects.toThrow()
    })
  })

  describe('Receive Request', () => {
    it('receiving a request passes it to SE and returns response', async () => {
      const fulfill = IlpFulfillFactory.build()
      const mockReceiveRequest = jest
        .fn()
        .mockImplementation((packet: IlpPrepare) => {
          return fulfill
        })
      settlementEngine.receiveRequest = mockReceiveRequest
      const prepare: IlpPrepare = IlpPrepareFactory.build()
      const response = await accounting.receiveRequest('alice', prepare)

      expect(mockReceiveRequest.mock.calls.length).toBe(1)
      expect(response).toStrictEqual(fulfill)
    })
  })

  describe('Account Update Subscription', () => {
    it('Updates to payable amount triggers the accounting system to check if needs to perform settlement', async () => {
      const maybeSettleMock = jest
        .fn()
        .mockImplementation((account: AccountSnapshot) => {
          expect(account.id).toBe('alice')
        })
      accounting.maybeSettle = maybeSettleMock

      // Need to do manually as need to bind the function call first
      await accounting.listen()

      await accounts.adjustBalancePayable(100n, 'alice', async ({ commit }) => {
        await commit()
      })

      expect(maybeSettleMock.mock.calls.length).toBe(1)
    })
  })

  describe('Settlement logic', () => {
    describe('maybe Settle', () => {
      it('Attempts to settle if balance payable exceeds settlement threshold', async () => {
        const account = await accounts.get('alice')
        account.balancePayable = 300n

        const mockSettlement = jest
          .fn()
          .mockImplementation(
            (account: AccountSnapshot, amount: bigint, scale: number) => {
              expect(account.id).toBe('alice')
              expect(amount).toBe(300n)
              expect(scale).toBe(6)
            }
          )

        accounting.sendSettlement = mockSettlement

        await accounting.maybeSettle(account)
        expect(mockSettlement.mock.calls.length).toBe(1)
      })

      it('Does not attempt to settle if balance payable is less than settlement threshold', async () => {
        const account = await accounts.get('alice')
        account.balancePayable = 100n

        const mockSettlement = jest
          .fn()
          .mockImplementation(
            (account: AccountSnapshot, amount: bigint, scale: number) => {}
          )

        accounting.sendSettlement = mockSettlement

        await accounting.maybeSettle(account)
        expect(mockSettlement.mock.calls.length).toBe(0)
      })
    })

    describe('sendSettlement', () => {
      it('Handles a send settlement operation', async () => {
        const account = await accounts.get('alice')
        account.balancePayable = 100n
        const mockEngineSendSettlement = jest
          .fn()
          .mockImplementation(
            (accountId: string, amount: bigint, scale: number) => {
              return {
                amount: 100n,
                scale: 9
              } as SettlementResponse
            }
          )

        settlementEngine.sendSettlement = mockEngineSendSettlement

        await accounting.sendSettlement(account, 100n, account.assetScale)

        expect(account.balancePayable.toString(10)).toEqual('0')
      })

      it('Handles settlements with different asset scales correctly', async () => {
        const account = await accounts.get('alice')
        account.balancePayable = 123456789n
        const mockEngineSendSettlement = jest
          .fn()
          .mockImplementation(
            (accountId: string, amount: bigint, scale: number) => {
              return {
                amount: 123456n,
                scale: 6
              } as SettlementResponse
            }
          )

        settlementEngine.sendSettlement = mockEngineSendSettlement

        await accounting.sendSettlement(account, 123456789n, account.assetScale)

        expect(account.balancePayable.toString(10)).toEqual('789')
      })

      it('Throws error if settlements responds with scale more precise than account can handle', async () => {
        const account = await accounts.get('alice')
        account.balancePayable = 123456789n
        const mockEngineSendSettlement = jest
          .fn()
          .mockImplementation(
            (accountId: string, amount: bigint, scale: number) => {
              return {
                amount: 123456n,
                scale: 12
              } as SettlementResponse
            }
          )

        settlementEngine.sendSettlement = mockEngineSendSettlement

        await expect(
          accounting.sendSettlement(account, 123456789n, account.assetScale)
        ).rejects.toThrow()
      })
    })
  })
})
