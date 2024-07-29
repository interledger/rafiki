import { v4 as uuid } from 'uuid'
import { fromTigerBeetleId, toTigerBeetleId, uuidToBigInt } from './utils'

describe('TigerBeetle Utils Test', (): void => {
  test('Test TigerBeetle Utils asset type', async (): Promise<void> => {
    const ledger = 1n
    expect(fromTigerBeetleId(ledger)).toEqual(
      `00000000-0000-0000-0000-00000000000${ledger}`
    )
  })

  test('Test TigerBeetle Utils liquidity accounts', async (): Promise<void> => {
    const uuidInitial = uuid()
    const tbId = toTigerBeetleId(uuidInitial)
    const fromTb = fromTigerBeetleId(tbId)
    expect(fromTb).toEqual(`${uuidInitial}`)

    // Invalid UUID:
    try {
      toTigerBeetleId(`${uuidInitial}-WRONG`)
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      // @ts-expect-error error message will always be present:
      expect(error.message).toEqual('wrong format of id')
    }
    expect.assertions(3)
  })

  test('Test ', async (): Promise<void> => {
    expect(uuidToBigInt('1ed4bdd8-adba-4e43-a76c-278ec1ae23cc')).toEqual(
      40981457350021189385292318948847395788n
    )
  })
})
