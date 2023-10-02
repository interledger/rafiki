import { serializeIlpPrepare, deserializeIlpPrepare } from 'ilp-packet'
import { IlpPrepareFactory } from '../../factories'
import { modifySerializedIlpPrepare } from '../../lib'

describe('modifySerializedIlpPrepare', () => {
  const START_DATE = 1434412800000 // June 16, 2015 00:00:00 GMT

  test.each([
    ['small length indicator', Buffer.alloc(0)],
    ['large length indication', Buffer.alloc(256)]
  ])('can modify the amount for %s', (desc, data: Buffer) => {
    const prepare = IlpPrepareFactory.build({
      amount: '10',
      expiresAt: new Date(START_DATE),
      data: data
    })

    const modifiedPrepare = modifySerializedIlpPrepare(
      serializeIlpPrepare(prepare),
      100n
    )

    const deserializedPacket = deserializeIlpPrepare(modifiedPrepare)
    expect(deserializedPacket.amount).toEqual('100')
    expect(deserializedPacket.expiresAt).toEqual(new Date(START_DATE))
  })

  test.each([
    ['small length indicator', Buffer.alloc(0)],
    ['large length indication', Buffer.alloc(256)]
  ])('can modify the expiry for %s', (desc, data: Buffer) => {
    const prepare = IlpPrepareFactory.build({
      amount: '10',
      expiresAt: new Date(START_DATE),
      data: data
    })

    const modifiedPrepare = modifySerializedIlpPrepare(
      serializeIlpPrepare(prepare),
      undefined,
      new Date(START_DATE - 30 * 1000)
    )

    const deserializedPacket = deserializeIlpPrepare(modifiedPrepare)
    expect(deserializedPacket.amount).toEqual('10')
    expect(deserializedPacket.expiresAt).toEqual(
      new Date(START_DATE - 30 * 1000)
    )
  })

  test.each([
    ['small length indicator', Buffer.alloc(0)],
    ['large length indication', Buffer.alloc(256)]
  ])('can modify the amount and expiry for %s', (desc, data: Buffer) => {
    const prepare = IlpPrepareFactory.build({
      amount: '10',
      expiresAt: new Date(START_DATE),
      data: data
    })

    const modifiedPrepare = modifySerializedIlpPrepare(
      serializeIlpPrepare(prepare),
      3624n,
      new Date(START_DATE - 30 * 1000)
    )

    const deserializedPacket = deserializeIlpPrepare(modifiedPrepare)
    expect(deserializedPacket.amount).toEqual('3624')
    expect(deserializedPacket.expiresAt).toEqual(
      new Date(START_DATE - 30 * 1000)
    )
  })
})
