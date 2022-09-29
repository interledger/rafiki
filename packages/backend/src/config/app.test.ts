import * as assert from 'assert'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { parseOrProvisionKey } from './app'

describe('Config', (): void => {
  const TMP_DIR = './tmp'
  const PRIVATE_KEY_FILE = `${TMP_DIR}/private-key.pem`

  beforeEach((): void => {
    if (!fs.existsSync(TMP_DIR)) {
      fs.mkdirSync(TMP_DIR)
    }
  })

  afterEach((): void => {
    fs.rmSync(TMP_DIR, { recursive: true, force: true })
  })

  describe('parseOrProvisionKey', (): void => {
    test('can provision key', (): void => {
      expect(parseOrProvisionKey(PRIVATE_KEY_FILE)).toBeInstanceOf(
        crypto.KeyObject
      )
      expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(true)
    })
    test('can parse key', (): void => {
      const keypair = crypto.generateKeyPairSync('ed25519')
      const keyfile = `${TMP_DIR}/test-private-key.pem`
      fs.writeFileSync(
        keyfile,
        keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
      )
      assert.ok(fs.existsSync(keyfile))
      expect(parseOrProvisionKey(keyfile)).toBeInstanceOf(crypto.KeyObject)
    })
    test('generates new key if wrong curve', (): void => {
      const keypair = crypto.generateKeyPairSync('ed448')
      const keyfile = `${TMP_DIR}/test-private-key.pem`
      fs.writeFileSync(
        keyfile,
        keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
      )
      assert.ok(fs.existsSync(keyfile))
      const key = parseOrProvisionKey(keyfile)
      expect(key).toBeInstanceOf(crypto.KeyObject)
      const jwk = key.export({ format: 'jwk' })
      expect(jwk.crv).toEqual('Ed25519')
      expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(true)
    })
  })
})
