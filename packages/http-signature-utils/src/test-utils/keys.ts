import crypto from 'crypto'
import { v4 } from 'uuid'

export type TestKeys = {
  keyId: string
  publicKey: crypto.KeyObject
  privateKey: crypto.KeyObject
}

export async function generateTestKeys(): Promise<TestKeys> {
  const keyId = v4()
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519')
  return { keyId, privateKey, publicKey }
}
