import Axios, { AxiosInstance } from 'axios'
import { serializeIlpPrepare } from 'ilp-packet'
import { Reader, Writer } from 'oer-utils'
import { Errors } from 'ilp-packet'
import { sendToPeer as sendToPeerDefault } from '../services'
import { OutgoingAccount, ILPContext, ILPMiddleware } from '../rafiki'
const { InvalidPacketError } = Errors

const MINIMUM_ECHO_PACKET_DATA_LENGTH = 16 + 1
const ECHO_DATA_PREFIX = Buffer.from('ECHOECHOECHOECHO', 'ascii')

export interface EchoProtocolControllerOptions {
  minMessageWindow: number
  sendToPeer?: (
    client: AxiosInstance,
    account: OutgoingAccount,
    prepare: Buffer
  ) => Promise<Buffer>
}

/**
 * Intercepts and handles messages addressed to the connector otherwise forwards it onto next.
 */
export function createEchoProtocolController({
  minMessageWindow,
  sendToPeer
}: EchoProtocolControllerOptions): ILPMiddleware {
  const send = sendToPeer || sendToPeerDefault
  const axios = Axios.create({ timeout: 30_000 })
  return async function echo(
    {
      services: { logger },
      request,
      response,
      accounts: { outgoing }
    }: ILPContext,
    _: () => Promise<void>
  ): Promise<void> {
    const { data, amount, expiresAt, executionCondition } = request.prepare
    if (data.length < MINIMUM_ECHO_PACKET_DATA_LENGTH) {
      throw new InvalidPacketError(
        'packet data too short for echo request. length=' + data.length
      )
    }
    if (!data.slice(0, 16).equals(ECHO_DATA_PREFIX)) {
      throw new InvalidPacketError(
        'packet data does not start with ECHO prefix.'
      )
    }

    const reader = new Reader(data)
    reader.skip(ECHO_DATA_PREFIX.length)
    const type = reader.readUInt8Number()

    if (type === 0) {
      const sourceAddress = reader.readVarOctetString().toString('ascii')
      const writer = new Writer()
      writer.write(ECHO_DATA_PREFIX)
      writer.writeUInt8(0x01)

      logger.debug({ sourceAddress }, 'responding to echo packet')

      const { http } = outgoing
      if (!http) {
        throw new Errors.UnreachableError('no outgoing endpoint')
      }
      response.rawReply = await send(
        axios,
        outgoing,
        serializeIlpPrepare({
          amount: amount,
          destination: sourceAddress,
          executionCondition: executionCondition,
          expiresAt: new Date(Number(expiresAt) - minMessageWindow),
          data: writer.getBuffer()
        })
      )
    } else {
      logger.error('received unexpected echo response.')
      throw new Error('received unexpected echo response.')
    }
  }
}
