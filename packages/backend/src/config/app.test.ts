import * as assert from 'assert'
import * as crypto from 'crypto'
import * as fs from 'fs'
import { parseOrProvisionKey } from './app'

describe('Config', (): void => {
  describe('parseOrProvisionKey', (): void => {
    const TMP_DIR = './tmp'
    const PRIVATE_KEY_FILE = `${TMP_DIR}/private-key.pem`

    beforeEach(async (): Promise<void> => {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    })

    afterEach(async (): Promise<void> => {
      fs.rmSync(TMP_DIR, { recursive: true, force: true })
    })

    test('can provision key', async (): Promise<void> => {
      expect(fs.existsSync(TMP_DIR)).toBe(false)
      expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(false)
      expect(parseOrProvisionKey(PRIVATE_KEY_FILE)).toBeInstanceOf(
        crypto.KeyObject
      )
      expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(true)
    })
    test('can parse key', async (): Promise<void> => {
      const keypair = crypto.generateKeyPairSync('ed25519')
      const keyfile = `${TMP_DIR}/test-private-key.pem`
      fs.mkdirSync(TMP_DIR)
      fs.writeFileSync(
        keyfile,
        keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
      )
      assert.ok(fs.existsSync(keyfile))
      const fileStats = fs.statSync(keyfile)
      const parsedKey = parseOrProvisionKey(keyfile)
      expect(parsedKey).toBeInstanceOf(crypto.KeyObject)
      expect(parsedKey.export({ format: 'pem', type: 'pkcs8' })).toEqual(
        keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
      )
      expect(fs.statSync(keyfile).mtimeMs).toEqual(fileStats.mtimeMs)
      expect(fs.existsSync(PRIVATE_KEY_FILE)).toEqual(false)
    })
    test.each`
      filename
      ${'test-private-key.pem'}
      ${'private-key.pem'}
    `(
      'generates new key if wrong curve',
      async ({ filename }): Promise<void> => {
        const keypair = crypto.generateKeyPairSync('ed448')
        const keyfile = `${TMP_DIR}/${filename}`
        fs.mkdirSync(TMP_DIR)
        fs.writeFileSync(
          keyfile,
          keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
        )
        assert.ok(fs.existsSync(keyfile))
        const fileStats = fs.statSync(keyfile)
        const key = parseOrProvisionKey(keyfile)
        expect(key).toBeInstanceOf(crypto.KeyObject)
        const jwk = key.export({ format: 'jwk' })
        expect(jwk.crv).toEqual('Ed25519')
        expect(key.export({ format: 'pem', type: 'pkcs8' })).not.toEqual(
          keypair.privateKey.export({ format: 'pem', type: 'pkcs8' })
        )
        if (keyfile === PRIVATE_KEY_FILE) {
          expect(fs.statSync(keyfile).mtimeMs).toBeGreaterThan(
            fileStats.mtimeMs
          )
        } else {
          expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(true)
          expect(fs.statSync(keyfile).mtimeMs).toEqual(fileStats.mtimeMs)
        }
      }
    )
  })
})
