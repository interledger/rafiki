import { generateKeyPair, privateEncrypt, publicDecrypt } from 'crypto'
import { promisify } from 'util'
import { createSigner, createVerifier } from '../../src'
import { expect } from 'chai'
import { RSA_PKCS1_PADDING } from 'constants'

describe('rsa-v1_5-sha256', () => {
  let rsaKeyPair: { publicKey: string; privateKey: string }
  before('generate key pair', async () => {
    rsaKeyPair = await promisify(generateKeyPair)('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    })
  })
  describe('signing', () => {
    it('signs a payload', async () => {
      const signer = createSigner('rsa-v1_5-sha256', rsaKeyPair.privateKey)
      const data = 'some random data'
      const sig = await signer(data)
      expect(signer.alg).to.equal('rsa-v1_5-sha256')
      expect(sig).to.satisfy((arg: Buffer) =>
        publicDecrypt(
          { key: rsaKeyPair.publicKey, padding: RSA_PKCS1_PADDING },
          arg
        )
      )
    })
  })
  describe('verifying', () => {
    it.skip('verifies a signature', async () => {
      const verifier = createVerifier('rsa-v1_5-sha256', rsaKeyPair.publicKey)
      const data = 'some random data'
      const sig = privateEncrypt(
        { key: rsaKeyPair.privateKey, padding: RSA_PKCS1_PADDING },
        Buffer.from(data)
      )
      const verified = await verifier(data, sig)
      expect(verifier.alg).to.equal('rsa-v1_5-sha256')
      expect(verified).to.equal(true)
    })
  })
})
