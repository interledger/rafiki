import { generateKeyPair, sign, verify } from 'crypto'
import { promisify } from 'util'
import { createSigner, createVerifier } from '../../src'
import { expect } from 'chai'
import { RSA_PKCS1_PSS_PADDING } from 'constants'
import { readFile } from 'fs'
import { join } from 'path'

describe('rsa-pss-sha512', () => {
  describe('internal tests', () => {
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
        const signer = createSigner('rsa-pss-sha512', rsaKeyPair.privateKey)
        const data = 'some random data'
        const sig = await signer(data)
        expect(signer.alg).to.equal('rsa-pss-sha512')
        expect(sig).to.satisfy((arg: Buffer) =>
          verify(
            'sha512',
            Buffer.from(data),
            {
              key: rsaKeyPair.publicKey,
              padding: RSA_PKCS1_PSS_PADDING
            },
            arg
          )
        )
      })
    })
    describe('verifying', () => {
      it('verifies a signature', async () => {
        const verifier = createVerifier('rsa-pss-sha512', rsaKeyPair.publicKey)
        const data = 'some random data'
        const sig = sign('sha512', Buffer.from(data), {
          key: rsaKeyPair.privateKey,
          padding: RSA_PKCS1_PSS_PADDING
        })
        expect(verifier.alg).to.equal('rsa-pss-sha512')
        expect(sig).to.satisfy((arg: Buffer) => verifier(data, arg))
      })
    })
  })
  describe('specification examples', () => {
    let rsaKeyPem: string
    before('load rsa key', async () => {
      rsaKeyPem = (
        await promisify(readFile)(join(__dirname, '../etc/rsa-pss.pem'))
      ).toString()
    })
    describe('minimal example', () => {
      const data =
        '"@signature-params": ();created=1618884475;keyid="test-key-rsa-pss";alg="rsa-pss-sha512"'
      it('successfully signs a payload', async () => {
        const sig = await createSigner('rsa-pss-sha512', rsaKeyPem)(data)
        expect(sig).to.satisfy((arg: Buffer) =>
          verify(
            'sha512',
            Buffer.from(data),
            {
              key: rsaKeyPem,
              padding: RSA_PKCS1_PSS_PADDING
            },
            arg
          )
        )
      })
      it('successfully verifies a signature', async () => {
        const sig = Buffer.from(
          'HWP69ZNiom9Obu1KIdqPPcu/C1a5ZUMBbqS/xwJECV8bhIQVmE' +
            'AAAzz8LQPvtP1iFSxxluDO1KE9b8L+O64LEOvhwYdDctV5+E39Jy1eJiD7nYREBgx' +
            'TpdUfzTO+Trath0vZdTylFlxK4H3l3s/cuFhnOCxmFYgEa+cw+StBRgY1JtafSFwN' +
            'cZgLxVwialuH5VnqJS4JN8PHD91XLfkjMscTo4jmVMpFd3iLVe0hqVFl7MDt6TMkw' +
            'IyVFnEZ7B/VIQofdShO+C/7MuupCSLVjQz5xA+Zs6Hw+W9ESD/6BuGs6LF1TcKLxW' +
            '+5K+2zvDY/Cia34HNpRW5io7Iv9/b7iQ==',
          'base64'
        )
        expect(
          await createVerifier('rsa-pss-sha512', rsaKeyPem)(data, sig)
        ).to.equal(true)
      })
    })
    describe('selective example', () => {
      const data =
        '"@authority": example.com\n' +
        '"content-type": application/json\n' +
        '"@signature-params": ("@authority" "content-type");created=1618884475;keyid="test-key-rsa-pss"'
      it('successfully signs a payload', async () => {
        const sig = await createSigner('rsa-pss-sha512', rsaKeyPem)(data)
        expect(sig).to.satisfy((arg: Buffer) =>
          verify(
            'sha512',
            Buffer.from(data),
            {
              key: rsaKeyPem,
              padding: RSA_PKCS1_PSS_PADDING
            },
            arg
          )
        )
      })
      it('successfully verifies a signature', async () => {
        const sig = Buffer.from(
          'ik+OtGmM/kFqENDf9Plm8AmPtqtC7C9a+zYSaxr58b/E6h81gh' +
            'JS3PcH+m1asiMp8yvccnO/RfaexnqanVB3C72WRNZN7skPTJmUVmoIeqZncdP2mlf' +
            'xlLP6UbkrgYsk91NS6nwkKC6RRgLhBFqzP42oq8D2336OiQPDAo/04SxZt4Wx9nDG' +
            'uy2SfZJUhsJqZyEWRk4204x7YEB3VxDAAlVgGt8ewilWbIKKTOKp3ymUeQIwptqYw' +
            'v0l8mN404PPzRBTpB7+HpClyK4CNp+SVv46+6sHMfJU4taz10s/NoYRmYCGXyadzY' +
            'YDj0BYnFdERB6NblI/AOWFGl5Axhhmjg==',
          'base64'
        )
        expect(
          await createVerifier('rsa-pss-sha512', rsaKeyPem)(data, sig)
        ).to.equal(true)
      })
    })
    describe('full example', () => {
      const data =
        '"date": Tue, 20 Apr 2021 02:07:56 GMT\n' +
        '"@method": POST\n' +
        '"@path": /foo\n' +
        '"@query": ?param=value&pet=dog\n' +
        '"@authority": example.com\n' +
        '"content-type": application/json\n' +
        '"digest": SHA-256=X48E9qOokqqrvdts8nOJRJN3OWDUoyWxBf7kbu9DBPE=\n' +
        '"content-length": 18\n' +
        '"@signature-params": ("date" "@method" "@path" "@query" "@authority" "content-type" "digest" "content-length");created=1618884475;keyid="test-key-rsa-pss"'
      it('successfully signs a payload', async () => {
        const sig = await createSigner('rsa-pss-sha512', rsaKeyPem)(data)
        expect(sig).to.satisfy((arg: Buffer) =>
          verify(
            'sha512',
            Buffer.from(data),
            {
              key: rsaKeyPem,
              padding: RSA_PKCS1_PSS_PADDING
            },
            arg
          )
        )
      })
      it('successfully verifies a signature', async () => {
        const sig = Buffer.from(
          'JuJnJMFGD4HMysAGsfOY6N5ZTZUknsQUdClNG51VezDgPUOW03' +
            'QMe74vbIdndKwW1BBrHOHR3NzKGYZJ7X3ur23FMCdANe4VmKb3Rc1Q/5YxOO8p7Ko' +
            'yfVa4uUcMk5jB9KAn1M1MbgBnqwZkRWsbv8ocCqrnD85Kavr73lx51k1/gU8w673W' +
            'T/oBtxPtAn1eFjUyIKyA+XD7kYph82I+ahvm0pSgDPagu917SlqUjeaQaNnlZzO03' +
            'Iy1RZ5XpgbNeDLCqSLuZFVID80EohC2CQ1cL5svjslrlCNstd2JCLmhjL7xV3NYXe' +
            'rLim4bqUQGRgDwNJRnqobpS6C1NBns/Q==',
          'base64'
        )
        expect(
          await createVerifier('rsa-pss-sha512', rsaKeyPem)(data, sig)
        ).to.equal(true)
      })
    })
  })
})
