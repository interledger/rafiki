import { Frame, Packet } from 'ilp-protocol-stream/dist/src/packet'
import Long from 'long'
import { IlpPacketType, IlpAddress, IlpFulfill, IlpReject, IlpErrorCode } from 'ilp-packet'
import { longFromValue, LongValue } from 'ilp-protocol-stream/dist/src/util/long'
import { createHmac, createHash, createCipheriv, createDecipheriv } from 'crypto'
import { randomBytes } from 'ilp-protocol-stream/dist/src/crypto'

const HASH_ALGORITHM = 'sha256'
const ENCRYPTION_ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

export const sha256 = (preimage: Buffer): Buffer =>
  createHash(HASH_ALGORITHM).update(preimage).digest()

export const hmac = (key: Buffer, message: Buffer): Buffer =>
  createHmac(HASH_ALGORITHM, key).update(message).digest()

export const encrypt = (key: Buffer, plaintext: Buffer): Buffer => {
  const iv = randomBytes(12)
  const cipher = createCipheriv(ENCRYPTION_ALGORITHM, key, iv)

  const ciphertext = []
  ciphertext.push(cipher.update(plaintext))
  ciphertext.push(cipher.final())
  const tag = cipher.getAuthTag()
  ciphertext.unshift(iv, tag)
  return Buffer.concat(ciphertext)
}

export const decrypt = (key: Buffer, ciphertext: Buffer): Buffer => {
  const nonce = ciphertext.slice(0, IV_LENGTH)

  // Buffer#slice is a reference to the same Buffer, but Node.js 10
  // throws an internal OpenSSL error if the auth tag uses the same
  // Buffer as the ciphertext, so copy to a new Buffer instead.
  const tag = Buffer.alloc(AUTH_TAG_LENGTH)
  ciphertext.copy(tag, 0, IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)

  const encrypted = ciphertext.slice(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ENCRYPTION_ALGORITHM, key, nonce)
  decipher.setAuthTag(tag)

  return Buffer.concat([decipher.update(encrypted), decipher.final()])
}

export const base64url = (buffer: Buffer): string =>
  buffer.toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')

/** Construct an ILP Fulfill or ILP Reject with a STREAM packet */
export class ReplyBuilder {
  private encryptionKey?: Buffer
  private sequence = Long.UZERO
  private receivedAmount = Long.UZERO
  private frames: Frame[] = []
  private ilpAddress = ''

  setIlpAddress(ilpAddress: IlpAddress): this {
    this.ilpAddress = ilpAddress
    return this
  }

  setEncryptionKey(key: Buffer): this {
    this.encryptionKey = key
    return this
  }

  setSequence(sequence: Long): this {
    this.sequence = sequence
    return this
  }

  setReceivedAmount(receivedAmount: LongValue): this {
    this.receivedAmount = longFromValue(receivedAmount, true)
    return this
  }

  addFrames(...frames: Frame[]): this {
    this.frames.push(...frames)
    return this
  }

  private buildData(type: IlpPacketType): Buffer {
    if (!this.encryptionKey) {
      return Buffer.alloc(0)
    }

    const streamPacket = new Packet(
      this.sequence,
      +type,
      this.receivedAmount,
      this.frames
    )._serialize()
    return encrypt(this.encryptionKey, streamPacket)
  }

  buildFulfill(fulfillment: Buffer): IlpFulfill {
    return {
      fulfillment,
      data: this.buildData(IlpPacketType.Fulfill),
    }
  }

  buildReject(code: IlpErrorCode): IlpReject {
    return {
      code,
      message: '',
      triggeredBy: this.ilpAddress,
      data: this.buildData(IlpPacketType.Reject),
    }
  }
}
