/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable no-fallthrough */
import {
  BinaryLike,
  createHmac,
  createSign,
  createVerify,
  KeyLike,
  KeyObject,
  sign,
  SignKeyObjectInput,
  SignPrivateKeyInput,
  timingSafeEqual,
  VerifyKeyObjectInput,
  VerifyPublicKeyInput
} from 'crypto'
import { RSA_PKCS1_PADDING, RSA_PKCS1_PSS_PADDING } from 'constants'

export type Algorithm =
  | 'rsa-v1_5-sha256'
  | 'ecdsa-p256-sha256'
  | 'hmac-sha256'
  | 'rsa-pss-sha512'
  | 'ed25519'

export function isAlgorithm(alg: string): alg is Algorithm {
  switch (alg as Algorithm) {
    case 'rsa-v1_5-sha256':
    case 'ecdsa-p256-sha256':
    case 'hmac-sha256':
    case 'rsa-pss-sha512':
    case 'ed25519':
      return true
    default:
      return false
  }
}

export interface Signer {
  (data: BinaryLike): Promise<Buffer>
  alg: Algorithm
}

export interface Verifier {
  (data: BinaryLike, signature: BinaryLike): Promise<boolean>
  alg: Algorithm
  keyid?: string
}
interface Ed25519PrivateKeyObject extends KeyObject {
  type: 'private'
  asymmetricKeyType: 'ed25519'
}
interface Ed25519SignKeyObjectInput extends SignKeyObjectInput {
  key: Ed25519PrivateKeyObject
}

function isEd25519PrivateKey(
  key: BinaryLike | KeyLike | SignKeyObjectInput | SignPrivateKeyInput
): key is Ed25519PrivateKeyObject | Ed25519SignKeyObjectInput {
  const keyObj = typeof key === 'object' && 'key' in key ? key.key : key
  return (
    typeof keyObj === 'object' &&
    'asymmetricKeyType' in keyObj &&
    keyObj.asymmetricKeyType === 'ed25519'
  )
}

export function createSigner(
  alg: Algorithm,
  key: BinaryLike | KeyLike | SignKeyObjectInput | SignPrivateKeyInput
): Signer {
  let signer
  switch (alg) {
    case 'hmac-sha256':
      signer = async (data: BinaryLike) =>
        createHmac('sha256', key as BinaryLike)
          .update(data)
          .digest()
      break
    case 'rsa-pss-sha512':
      signer = async (data: BinaryLike) =>
        createSign('sha512')
          .update(data)
          .sign({
            key,
            padding: RSA_PKCS1_PSS_PADDING
          } as SignPrivateKeyInput)
      break
    case 'rsa-v1_5-sha256':
      signer = async (data: BinaryLike) =>
        createSign('sha256')
          .update(data)
          .sign({
            key,
            padding: RSA_PKCS1_PADDING
          } as SignPrivateKeyInput)
      break
    case 'ecdsa-p256-sha256':
      signer = async (data: BinaryLike) =>
        createSign('sha256')
          .update(data)
          .sign(key as KeyLike)
      break
    case 'ed25519':
      if (!isEd25519PrivateKey(key)) {
        throw new Error('Invalid key for ed25519 signer.')
      }
      signer = async (data: BinaryLike) => {
        ;async (data: BinaryLike): Promise<Buffer> => {
          return sign(
            'ed25519',
            typeof data === 'string' ? Buffer.from(data) : data,
            key
          )
        }
      }
    default:
      throw new Error(`Unsupported signing algorithm ${alg}`)
  }
  return Object.assign(signer, { alg })
}

export function createVerifier(
  alg: Algorithm,
  key: BinaryLike | KeyLike | VerifyKeyObjectInput | VerifyPublicKeyInput
): Verifier {
  let verifier
  switch (alg) {
    case 'hmac-sha256':
      verifier = async (data: BinaryLike, signature: BinaryLike) => {
        const expected = createHmac('sha256', key as BinaryLike)
          .update(data)
          .digest()
        const sig = Buffer.from(signature)
        return sig.length === expected.length && timingSafeEqual(sig, expected)
      }
      break
    case 'rsa-pss-sha512':
      verifier = async (data: BinaryLike, signature: BinaryLike) =>
        createVerify('sha512')
          .update(data)
          .verify(
            {
              key,
              padding: RSA_PKCS1_PSS_PADDING
            } as VerifyPublicKeyInput,
            Buffer.from(signature)
          )
      break
    case 'rsa-v1_5-sha256':
      verifier = async (data: BinaryLike, signature: BinaryLike) =>
        createVerify('sha256')
          .update(data)
          .verify(
            {
              key,
              padding: RSA_PKCS1_PADDING
            } as VerifyPublicKeyInput,
            Buffer.from(signature)
          )
      break
    case 'ecdsa-p256-sha256':
      verifier = async (data: BinaryLike, signature: BinaryLike) =>
        createVerify('sha256')
          .update(data)
          .verify(key as KeyLike, Buffer.from(signature))
      break
    default:
      throw new Error(`Unsupported signing algorithm ${alg}`)
  }
  return Object.assign(verifier, { alg })
}
