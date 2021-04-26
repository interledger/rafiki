import { Writer } from 'oer-utils'
import { IlpPrepare, serializeIlpPrepare } from 'ilp-packet'
import { createContext } from '../../../utils'
import { RafikiContext } from '../../rafiki'
import { createEchoProtocolController } from '../../controllers/echo-protocol'
import { PeerFactory, RafikiServicesFactory } from '../../factories'
import { ZeroCopyIlpPrepare } from '../../middleware/ilp-packet'

const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')
const minMessageWindow = 1000

describe('Echo protocol', function () {
  const controller = createEchoProtocolController(minMessageWindow)
  const initialEchoWriter = new Writer()
  initialEchoWriter.write(ECHO_DATA_PREFIX)
  initialEchoWriter.writeUInt8(0x0)
  initialEchoWriter.writeVarOctetString(Buffer.from('test.fred.bob')) // source address
  const initialEchoData = initialEchoWriter.getBuffer()
  const responseEchoWriter = new Writer()
  responseEchoWriter.write(ECHO_DATA_PREFIX)
  responseEchoWriter.writeUInt8(0x01)
  const responseEchoData = responseEchoWriter.getBuffer()

  const alice = PeerFactory.build()
  const bob = PeerFactory.build()
  const services = RafikiServicesFactory.build()
  const ctx = createContext<any, RafikiContext>()
  ctx.services = services
  ctx.peers = {
    get incoming() {
      return Promise.resolve(alice)
    },
    get outgoing() {
      return Promise.resolve(bob)
    }
  }

  test('creates type 1 echo packet and sends to the outgoing peer if flag = 0', async function () {
    const expiry = new Date()
    const condition = Buffer.alloc(32)
    const echoPacket: IlpPrepare = {
      destination: 'test.connie.alice',
      amount: '0',
      expiresAt: expiry,
      data: initialEchoData,
      executionCondition: condition
    }
    const type1EchoPacket: IlpPrepare = {
      destination: 'test.fred.bob',
      amount: '0',
      expiresAt: new Date(Number(expiry) - minMessageWindow),
      data: responseEchoData,
      executionCondition: condition
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(echoPacket)

    await expect(controller(ctx)).resolves.toBeUndefined()

    expect(bob.send).toHaveBeenCalledWith(serializeIlpPrepare(type1EchoPacket))
  })

  test('throws invalid packet type error if packet data does not meet minimum echo packet data length', async function () {
    const writer = new Writer()
    writer.write(Buffer.from('tooshort'))
    const incorrectEchoPacket = {
      destination: 'test.connie.alice',
      amount: '0',
      expiresAt: new Date(),
      data: writer.getBuffer(),
      executionCondition: Buffer.alloc(32)
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(incorrectEchoPacket)

    await expect(controller(ctx)).rejects.toThrowError(
      'packet data too short for echo request. length=8'
    )
  })

  test('throws invalid packet type error if packet data does not start with echo prefix', async function () {
    const writer = new Writer()
    writer.write(Buffer.from('NOTECHOECHOECHOECHO'))
    const incorrectEchoPacket = {
      destination: 'test.connie.alice',
      amount: '0',
      expiresAt: new Date(),
      data: writer.getBuffer(),
      executionCondition: Buffer.alloc(32)
    }
    ctx.request.prepare = new ZeroCopyIlpPrepare(incorrectEchoPacket)

    await expect(controller(ctx)).rejects.toThrowError(
      'packet data does not start with ECHO prefix.'
    )
  })

  test('throws error for unexpected echo response', async function () {
    const unexpectedEchoPacket = {
      destination: 'test.connie.alice',
      amount: '0',
      expiresAt: new Date(),
      data: responseEchoData,
      executionCondition: Buffer.alloc(32)
    }

    ctx.request.prepare = new ZeroCopyIlpPrepare(unexpectedEchoPacket)

    await expect(controller(ctx)).rejects.toThrowError(
      'received unexpected echo response.'
    )
  })
})
