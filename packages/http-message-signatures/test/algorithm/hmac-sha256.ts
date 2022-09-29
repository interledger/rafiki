import { createSigner, createVerifier } from '../../src'
import { expect } from 'chai'

describe('hmac-sha256', () => {
  // examples from wikipedia https://en.wikipedia.org/w/index.php?title=HMAC&oldid=1046955366#Examples
  describe('internal tests', () => {
    const data = 'The quick brown fox jumps over the lazy dog'
    const sig = Buffer.from(
      'f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8',
      'hex'
    )
    it('signs a payload correctly', async () => {
      const hmac = createSigner('hmac-sha256', 'key')
      expect(hmac.alg).to.equal('hmac-sha256')
      expect(await hmac(data)).to.deep.equal(sig)
    })
    it('verifies a payload correctly', async () => {
      const hmac = createVerifier('hmac-sha256', 'key')
      expect(hmac.alg).to.equal('hmac-sha256')
      expect(await hmac(data, sig)).to.equal(true)
    })
  })
  // see https://datatracker.ietf.org/doc/html/draft-ietf-httpbis-message-signatures-06#appendix-B.2.5
  describe('specification examples', () => {
    const testSharedSecret = Buffer.from(
      'uzvJfB4u3N0Jy4T7NZ75MDVcr8zSTInedJtkgcu46YW4XByzNJjxBdtjUkdJPBtbmHhIDi6pcl8jsasjlTMtDQ==',
      'base64'
    )
    const expectedSig = Buffer.from(
      'fN3AMNGbx0V/cIEKkZOvLOoC3InI+lM2+gTv22x3ia8=',
      'base64'
    )
    const signatureInput =
      '"@authority": example.com\n' +
      '"date": Tue, 20 Apr 2021 02:07:55 GMT\n' +
      '"content-type": application/json\n' +
      '"@signature-params": ("@authority" "date" "content-type");created=1618884475;keyid="test-shared-secret"'
    it('generates an expected hmac', async () => {
      const hmac = createSigner('hmac-sha256', testSharedSecret)
      const sig = await hmac(signatureInput)
      expect(hmac.alg).to.equal('hmac-sha256')
      expect(sig).to.deep.equal(expectedSig)
    })
    it('verifies a provided signature', async () => {
      const hmac = createVerifier('hmac-sha256', testSharedSecret)
      expect(hmac.alg).to.equal('hmac-sha256')
      expect(await hmac(signatureInput, expectedSig)).to.equal(true)
    })
  })
})
