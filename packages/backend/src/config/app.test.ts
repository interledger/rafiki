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

    test.each`
      tmpDirExists
      ${false}
      ${true}
    `(
      'can provision key - tmp dir exists: $tmpDirExists',
      async ({ tmpDirExists }): Promise<void> => {
        if (tmpDirExists) {
          fs.mkdirSync(TMP_DIR)
        }
        expect(fs.existsSync(TMP_DIR)).toBe(tmpDirExists)
        expect(fs.existsSync(PRIVATE_KEY_FILE)).toBe(false)
        const { key, jwk } = parseOrProvisionKey(PRIVATE_KEY_FILE)
        expect(key).toMatchObject({
          asymmetricKeyType: 'ed25519',
          type: 'private'
        })
        expect(jwk).toEqual(key.export({ format: 'jwk' }))
        expect(jwk).toEqual({
          crv: 'Ed25519',
          kty: 'OKP',
          d: expect.any(String),
          x: expect.any(String)
        })
        expect(fs.readFileSync(PRIVATE_KEY_FILE, 'utf8')).toEqual(
          key.export({ format: 'pem', type: 'pkcs8' })
        )
      }
    )
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
      const { key, jwk } = parseOrProvisionKey(keyfile)
      expect(key).toBeInstanceOf(crypto.KeyObject)
      expect(jwk).toEqual({
        crv: 'Ed25519',
        kty: 'OKP',
        d: expect.any(String),
        x: expect.any(String)
      })
      expect(key.export({ format: 'pem', type: 'pkcs8' })).toEqual(
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
        const { key, jwk } = parseOrProvisionKey(keyfile)
        expect(key).toBeInstanceOf(crypto.KeyObject)
        expect(jwk).toMatchObject({
          crv: 'Ed25519',
          kty: 'OKP',
          d: expect.any(String),
          x: expect.any(String)
        })
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
