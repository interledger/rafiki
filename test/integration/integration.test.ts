import { OpenPaymentsClientError } from '@interledger/open-payments'
import { C9_CONFIG, HLB_CONFIG } from './lib/config'
import { MockASE } from './lib/MockASE'
import { WebhookEventType } from 'mock-account-servicing-lib'

describe('Open Payments Flow', (): void => {
  let c9: MockASE
  let hlb: MockASE

  beforeAll(async () => {
    c9 = await MockASE.create(C9_CONFIG)
    hlb = await MockASE.create(HLB_CONFIG)
  })

  afterAll(async () => {
    c9.shutdown()
    hlb.shutdown()
  })

  test('Can Get Existing Wallet Address', async (): Promise<void> => {
    const walletAddress = await c9.opClient.walletAddress.get({
      url: 'http://localhost:4000/accounts/pfry'
    })
    // TODO: better expect.
    // tried jestOpenapi.toSatifyApiSpec but loading throws errors
    // for invalid spec? something not right there because that works in other pkgs
    expect(walletAddress).toBeTruthy()
  })

  test.skip('Get Non-Existing Wallet Address Triggers Not Found Webhook Event', async (): Promise<void> => {
    let walletAddress

    const handleWebhookEventSpy = jest.spyOn(
      c9.webhookServer.webhookEventHandler,
      'handleWebhookEvent'
    )
    try {
      walletAddress = await c9.opClient.walletAddress.get({
        url: 'http://localhost:4000/accounts/asmith'
      })
    } catch (e) {
      // 404 error from client is expected - swallow it
      if (!(e instanceof OpenPaymentsClientError)) throw e
    }

    expect(handleWebhookEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: WebhookEventType.WalletAddressNotFound,
        data: expect.any(Object)
      })
    )
  })

  test('Grant Request Incoming Payment', async (): Promise<void> => {
    const receiverWalletAddressUrl = 'http://localhost:4000/accounts/pfry'
    console.log({ receiverWalletAddressUrl })
    const walletAddress = await c9.opClient.walletAddress.get({
      url: receiverWalletAddressUrl
    })
    console.log({ walletAddress })

    // TODO: remove try catch when done debugging
    // ERROR: 401, invalid signature
    // - with env var: WALLET_ADDRESS_URL=https://cloud-nine-wallet-test-backend/.well-known/pay
    // error happens in auth's grantInitiationHttpsigMiddleware
    // ultimately, http-sig-middleware > validateSignatures > crypto.verify resolves to false

    // Also fails with "invalid client" with env var: WALLET_ADDRESS_URL=http://localhost:3000/.well-known/pay
    // This is also in grantInitiationHttpsigMiddleware, but doesnt get as far (clientService.getKey doesn't find anything)

    // Make sure that the public key used for verification (publicKey) matches the private key used for signing. Ensure that the key parameters (algorithm, key type, curve, etc.) are correct.
    // Verify that the data being signed (data) is identical to the data used during the signing process. Any difference in the data will cause the verification to fail.

    // explorse this more (from cat /tmp/rafiki_integration_logs.txt):
    // rafiki-test-happy-life-auth-1 | entering grantInitiationHttpsigMiddleware
    // rafiki-test-happy-life-auth-1 | {"level":50,"time":1707515411497,"pid":1,"hostname":"happy-life-bank-test-auth","url":"http://localhost:3001/.well-known/pay/jwks.json","msg":"Error when making Open Payments GET request: connect ECONNREFUSED 127.0.0.1:3001"}

    // here are the args passed into validateSignature(clientKey, contextToRequestLike(ctx)).
    // can i unit test in http-signature-utils with this exact object?

    // {
    //   clientKey: {
    //     alg: 'EdDSA',
    //     kid: 'rafiki-test',
    //     kty: 'OKP',
    //     crv: 'Ed25519',
    //     x: 'ZK_FZg674Yr7WkXpmmX0Ms8JpHkFxIlvT49KMdZUOz4'
    //   },
    //   'contextToRequestLike(ctx)': {
    //     url: 'http://localhost:4006/',
    //     method: 'POST',
    //     headers: {
    //       accept: 'application/json',
    //       'content-type': 'application/json',
    //       'content-digest': 'sha-512=:eUzgyjzaPgekk/GPjfrUqKkpHgvtOmtk/rhASd5TlPc+LzOcLRkjFBwNEoPYdl5JxrlRe8RctRinw+o3W3RAkA==:',
    //       'content-length': '169',
    //       signature: 'sig1=:gticfDAmsDWpS/lbF3R5SZDoOdaPLGm81POFw5BI/TFFmGkpOE3lDZRYDjVJVnZKw5jU2/X5eGFzoz3Lx2phCA==:',
    //       'signature-input': 'sig1=("@method" "@target-uri" "content-digest" "content-length" "content-type");created=1707358816;keyid="rafiki-test";alg="ed25519"',
    //       'user-agent': 'axios/1.6.7',
    //       'accept-encoding': 'gzip, compress, deflate, br',
    //       host: 'localhost:4006',
    //       connection: 'close'
    //     },
    //     body: '{"access_token":{"access":[{"type":"incoming-payment","actions":["create","read","list","complete"]}]},"client":"https://cloud-nine-wallet-test-backend/.well-known/pay"}'
    //   }
    try {
      const grant = await c9.opClient.grant.request(
        {
          url: walletAddress.authServer
        },
        {
          access_token: {
            access: [
              {
                type: 'incoming-payment',
                actions: ['create', 'read', 'list', 'complete']
              }
            ]
          }
          // TODO: do we need this?
          // interact: {
          //   start: ['redirect']
          // }
        }
      )

      console.log({ grant })
    } catch (e) {
      console.log({ e })
      throw e
    }

    // if (!isPendingGrant(grant)) {
    //   throw new Error('Expected interactive grant')
    // }
    // expect(true).toBe(false)
  })

  // test('Create Incoming Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Quote', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Quote', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Grant Request Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Continuation Request', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })

  // test('Create Outgoing Payment', async (): Promise<void> => {
  //   expect(true).toBe(true)
  // })
})
