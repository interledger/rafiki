/* eslint-disable prefer-const, @typescript-eslint/no-empty-function, @typescript-eslint/no-non-null-assertion */
import { StreamServer } from '@interledger/stream-receiver'
import { describe, expect, it, jest } from '@jest/globals'
import { createApp } from 'ilp-connector'
import { IlpError } from 'ilp-packet'
import { Connection, createServer, DataAndMoneyStream } from 'ilp-protocol-stream'
import { randomBytes } from 'crypto'
import {
  ConnectionAssetDetailsFrame,
  IlpPacketType,
  Packet,
} from 'ilp-protocol-stream/dist/src/packet'
import Long from 'long'
import nock from 'nock'
import { PaymentError, PaymentType, setupPayment, startQuote } from '../src'
import { fetchPaymentDetails, Account } from '../src/open-payments'
import { generateEncryptionKey, Int } from '../src/utils'
import {
  createMaxPacketMiddleware,
  createPlugin,
  createRateMiddleware,
  createSlippageMiddleware,
  createStreamReceiver,
  MirrorPlugin,
  RateBackend,
} from './helpers/plugin'
import { CustomBackend } from './helpers/rate-backend'
import reduct from 'reduct'
import { URL } from 'url'

interface setupNockOptions {
  incomingPaymentId?: string | null
  accountUrl?: string | null
  destinationPayment?: string | null
  completed?: boolean | string | null
  incomingAmount?: NockAmount | null
  receivedAmount?: NockAmount | null
  expiresAt?: string | null
  description?: string | null
  externalRef?: string | null
  connectionId?: string | null
}

type NockAmount = {
  value: string
  assetCode: string
  assetScale: number
}

const plugin = createPlugin()
const streamServer = new StreamServer({
  serverSecret: randomBytes(32),
  serverAddress: 'private.larry',
})
const streamReceiver = createStreamReceiver(streamServer)
const uuid = () => '2646f447-542a-4f0a-a557-f7492b46265f'

const setupNock = (options: setupNockOptions) => {
  const { ilpAddress, sharedSecret } = streamServer.generateCredentials()
  const incomingPaymentId =
    options.incomingPaymentId !== null ? options.incomingPaymentId || uuid() : undefined
  const accountUrl =
    options.accountUrl !== null ? options.accountUrl || 'https://wallet.example/alice' : undefined
  const destinationPayment =
    options.destinationPayment !== null
      ? options.destinationPayment || `${accountUrl}/incoming-payments/${incomingPaymentId}`
      : undefined
  const completed = options.completed !== null ? options.completed || false : undefined
  const incomingAmount =
    options.incomingAmount !== null
      ? options.incomingAmount || {
          value: '40000',
          assetCode: 'USD',
          assetScale: 4,
        }
      : undefined
  const receivedAmount =
    options.receivedAmount !== null
      ? options.receivedAmount || {
          value: '20000',
          assetCode: 'USD',
          assetScale: 4,
        }
      : undefined
  const expiresAt =
    options.expiresAt !== null
      ? options.expiresAt !== undefined
        ? options.expiresAt
        : new Date(Date.now() + 60 * 60 * 1000 * 24).toISOString() // 1 day in the future
      : undefined
  const description = options.description !== null ? options.description || 'Coffee' : undefined
  const externalRef = options.externalRef !== null ? options.externalRef || '#123' : undefined
  const ilpStreamConnection =
    options.connectionId !== null
      ? options.connectionId
        ? `https://wallet.example/${options.connectionId}`
        : {
            id: `https://wallet.example/${uuid()}`,
            ilpAddress,
            sharedSecret: sharedSecret.toString('base64'),
          }
      : undefined

  nock('https://wallet.example')
    .get(`/alice/incoming-payments/${incomingPaymentId}`)
    .matchHeader('Accept', 'application/json')
    .reply(200, {
      id: destinationPayment,
      paymentPointer: accountUrl,
      completed,
      incomingAmount,
      receivedAmount,
      expiresAt,
      description,
      externalRef,
      ilpStreamConnection,
    })

  if (typeof ilpStreamConnection === 'string') {
    nock('https://wallet.example')
      .get(`/${options.connectionId}`)
      .matchHeader('Accept', 'application/json')
      .reply(200, {
        id: `https://wallet.example/${options.connectionId}`,
        ilpAddress,
        sharedSecret: sharedSecret.toString('base64'),
      })
  }

  return {
    incomingPaymentId,
    destinationPayment,
    accountUrl,
    completed,
    incomingAmount,
    receivedAmount,
    expiresAt,
    description,
    externalRef,
    ilpAddress,
    sharedSecret,
  }
}

describe('open payments', () => {
  const destinationAddress = 'g.wallet.receiver.12345'
  const sharedSecret = randomBytes(32)
  const sharedSecretBase64 = sharedSecret.toString('base64')
  const account: Account = {
    id: 'https://wallet.example/alice',
    publicName: 'alice',
    assetCode: 'USD',
    assetScale: 4,
    authServer: 'https://auth.wallet.example',
  }
  const accountUrl = new URL(account.id)

  it('fails if more than one destination provided', async () => {
    await expect(
      fetchPaymentDetails({
        destinationPayment: `https://wallet.com/alice/incoming-payments/${uuid()}`,
        destinationConnection: `https://wallet.com/${uuid()}`,
      })
    ).resolves.toBe(PaymentError.InvalidDestination)
  })

  it('quotes an Incoming Payment', async () => {
    const prices = {
      EUR: 1,
      USD: 1.12,
    }

    const plugin = createPlugin(
      createRateMiddleware(
        new RateBackend({ code: 'EUR', scale: 3 }, { code: 'USD', scale: 4 }, prices)
      ),
      streamReceiver
    )

    const {
      accountUrl,
      destinationPayment,
      expiresAt,
      incomingAmount,
      receivedAmount,
      description,
      externalRef,
      ilpAddress,
      sharedSecret,
    } = setupNock({})

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    const { minDeliveryAmount, minExchangeRate, paymentType } = await startQuote({
      plugin,
      destination,
      prices,
      sourceAsset: {
        code: 'EUR',
        scale: 4,
      },
    })

    // Tests that it quotes the remaining amount to deliver in the Incoming Payment
    expect(paymentType).toBe(PaymentType.FixedDelivery)
    expect(minExchangeRate).toBeDefined()
    expect(minDeliveryAmount).toBe(BigInt(40000 - 20000))
    expect(destination.destinationPaymentDetails).toMatchObject({
      id: destinationPayment,
      paymentPointer: accountUrl,
      expiresAt: new Date(expiresAt!).getTime(),
      description,
      receivedAmount: receivedAmount
        ? {
            value: BigInt(receivedAmount.value),
            assetCode: receivedAmount.assetCode,
            assetScale: receivedAmount.assetScale,
          }
        : undefined,
      incomingAmount: incomingAmount
        ? {
            value: BigInt(incomingAmount.value),
            assetCode: incomingAmount.assetCode,
            assetScale: incomingAmount.assetScale,
          }
        : undefined,
      externalRef,
    })
    expect(destination.destinationAsset).toMatchObject({
      code: 'USD',
      scale: 4,
    })
    expect(destination.destinationAddress).toBe(ilpAddress)
    expect(destination.sharedSecret.equals(sharedSecret))
    expect(destination.accountUrl).toBe(accountUrl)
  })

  it('quotes an Incoming Payment without incomingAmount', async () => {
    const prices = {
      EUR: 1,
      USD: 1.12,
    }

    const plugin = createPlugin(
      createRateMiddleware(
        new RateBackend({ code: 'EUR', scale: 3 }, { code: 'USD', scale: 4 }, prices)
      ),
      streamReceiver
    )

    const {
      accountUrl,
      destinationPayment,
      expiresAt,
      receivedAmount,
      description,
      externalRef,
      ilpAddress,
      sharedSecret,
    } = setupNock({ incomingAmount: null })

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    const { minDeliveryAmount, minExchangeRate, paymentType } = await startQuote({
      plugin,
      destination,
      prices,
      sourceAsset: {
        code: 'EUR',
        scale: 4,
      },
      amountToSend: BigInt(400),
    })

    // Tests that it quotes the remaining amount to deliver in the Incoming Payment
    expect(paymentType).toBe(PaymentType.FixedSend)
    expect(minExchangeRate).toBeDefined()
    expect(minDeliveryAmount).toBe(BigInt(353))
    expect(destination.destinationPaymentDetails).toMatchObject({
      id: destinationPayment,
      paymentPointer: accountUrl,
      expiresAt: new Date(expiresAt!).getTime(),
      description,
      receivedAmount: receivedAmount
        ? {
            value: BigInt(receivedAmount.value),
            assetCode: receivedAmount.assetCode,
            assetScale: receivedAmount.assetScale,
          }
        : undefined,
      externalRef,
    })
    expect(destination.destinationAsset).toMatchObject({
      code: 'USD',
      scale: 4,
    })
    expect(destination.destinationAddress).toBe(ilpAddress)
    expect(destination.sharedSecret.equals(sharedSecret))
    expect(destination.accountUrl).toBe(accountUrl)
  })

  it('fails to quotes an Incoming Payment without incomingAmount, amountToSend or amountToDeliver', async () => {
    const prices = {
      EUR: 1,
      USD: 1.12,
    }

    const plugin = createPlugin(
      createRateMiddleware(
        new RateBackend({ code: 'EUR', scale: 3 }, { code: 'USD', scale: 4 }, prices)
      ),
      streamReceiver
    )

    const { destinationPayment } = setupNock({ incomingAmount: null })

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    await expect(startQuote({ plugin, destination })).rejects.toBe(
      PaymentError.UnknownPaymentTarget
    )
  })

  it('fails if Incoming Payment url is not HTTPS or HTTP', async () => {
    await expect(
      fetchPaymentDetails({ destinationPayment: 'oops://this-is-a-wallet.co/incoming-payment/123' })
    ).resolves.toBe(PaymentError.QueryFailed)
  })

  it('fails if given a payment pointer as an Incoming Payment url', async () => {
    await expect(fetchPaymentDetails({ destinationPayment: '$foo.money' })).resolves.toBe(
      PaymentError.QueryFailed
    )
  })

  it('fails if the Incoming Payment was already paid', async () => {
    const { destinationPayment } = setupNock({
      receivedAmount: {
        value: '40300', // Paid $4.03 of $4
        assetCode: 'USD',
        assetScale: 4,
      },
    })

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    await expect(startQuote({ plugin, destination })).rejects.toBe(
      PaymentError.IncomingPaymentCompleted
    )
  })

  it('fails if the Incoming Payment was already completed', async () => {
    const { destinationPayment } = setupNock({
      completed: true,
      receivedAmount: {
        value: '40000', // Paid $4.03 of $4
        assetCode: 'USD',
        assetScale: 4,
      },
    })

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    await expect(startQuote({ plugin, destination })).rejects.toBe(
      PaymentError.IncomingPaymentCompleted
    )
  })

  it('fails if the Incoming Payment has expired', async () => {
    const { destinationPayment } = setupNock({
      expiresAt: new Date().toISOString(),
    })

    const destination = await setupPayment({
      destinationPayment,
      plugin,
    })
    await expect(startQuote({ plugin, destination })).rejects.toBe(
      PaymentError.IncomingPaymentExpired
    )
  })

  it.each`
    connectionId                              | description
    ${undefined}                              | ${'connection details'}
    ${'b4d6ead2-f7e6-42fd-932b-80c107977bff'} | ${'connection URL'}
  `('resolves and validates an Incoming Payment with $description', async ({ connectionId }) => {
    const {
      accountUrl,
      destinationPayment,
      expiresAt,
      incomingAmount,
      receivedAmount,
      description,
      externalRef,
      ilpAddress,
      sharedSecret,
    } = setupNock({ connectionId })

    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toMatchObject({
      sharedSecret,
      destinationAddress: ilpAddress,
      destinationAsset: {
        code: 'USD',
        scale: 4,
      },
      destinationPaymentDetails: {
        receivedAmount: receivedAmount
          ? {
              value: BigInt(receivedAmount.value),
              assetCode: receivedAmount.assetCode,
              assetScale: receivedAmount.assetScale,
            }
          : undefined,
        incomingAmount: incomingAmount
          ? {
              value: BigInt(incomingAmount.value),
              assetCode: incomingAmount.assetCode,
              assetScale: incomingAmount.assetScale,
            }
          : undefined,
        id: destinationPayment,
        paymentPointer: accountUrl,
        expiresAt: new Date(expiresAt!).getTime(),
        description,
        externalRef,
      },
    })
  })

  it('resolves and validates an Incoming Payment if incomingAmount, expiresAt, description, and externalRef are missing', async () => {
    const { accountUrl, destinationPayment, receivedAmount, ilpAddress, sharedSecret } = setupNock({
      incomingAmount: null,
      expiresAt: null,
      description: null,
      externalRef: null,
    })

    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toMatchObject({
      sharedSecret,
      destinationAddress: ilpAddress,
      destinationAsset: {
        code: 'USD',
        scale: 4,
      },
      destinationPaymentDetails: {
        receivedAmount: receivedAmount
          ? {
              value: BigInt(receivedAmount.value),
              assetCode: receivedAmount.assetCode,
              assetScale: receivedAmount.assetScale,
            }
          : undefined,
        id: destinationPayment,
        paymentPointer: accountUrl,
      },
    })
  })

  it('fails if Incoming Payment amounts are not positive and u64', async () => {
    const { destinationPayment } = setupNock({
      incomingAmount: {
        value: '100000000000000000000000000000000000000000000000000000000',
        assetCode: 'USD',
        assetScale: 5,
      },
      receivedAmount: {
        value: '-20',
        assetCode: 'USD',
        assetScale: 5,
      },
    })

    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
  })

  it('fails if completed cannot be parsed', async () => {
    const { destinationPayment } = setupNock({
      completed: 'foo',
    })

    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
  })

  it('fails if expiresAt cannot be parsed', async () => {
    const { destinationPayment } = setupNock({
      expiresAt: 'foo',
    })

    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
  })

  it('fails if Incoming Payment query times out', async () => {
    const scope = nock('https://money.example').get(/.*/).delay(6000).reply(500)
    await expect(
      fetchPaymentDetails({ destinationPayment: 'https://money.example' })
    ).resolves.toBe(PaymentError.QueryFailed)
    scope.done()
    nock.abortPendingRequests()
  })

  it('fails if Incoming Payment query returns 4xx error', async () => {
    const destinationPayment = 'https://example.com/foo'
    const scope = nock('https://example.com').get('/foo').reply(404) // Query fails
    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
  })

  it('fails if Incoming Payment query response is invalid', async () => {
    // Validates Incoming Payment must be a non-null object
    const destinationPayment = 'https://open.mywallet.com/incoming-payments/123'
    const scope1 = nock('https://open.mywallet.com')
      .get('/incoming-payments/123')
      .reply(200, '"not an Incoming Payment"')
    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope1.done()

    // Validates Incoming Payment must contain other details, not simply credentials
    const scope2 = nock('https://open.mywallet.com')
      .get('/incoming-payments/123')
      .reply(200, {
        sharedSecret: randomBytes(32).toString('base64'),
        ilpAddress: 'private.larry.receiver',
      })
    await expect(fetchPaymentDetails({ destinationPayment })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope2.done()
  })

  it('fails if account query fails', async () => {
    const scope = nock(accountUrl.origin)
      .get(accountUrl.pathname)
      .matchHeader('Accept', /application\/json/)
      .reply(500)
    await expect(fetchPaymentDetails({ destinationAccount: account.id })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
  })

  it('fails if account query times out', async () => {
    const scope = nock(accountUrl.origin)
      .get(accountUrl.pathname)
      .matchHeader('Accept', /application\/json/)
      .delay(7000)
      .reply(500)
    await expect(fetchPaymentDetails({ destinationAccount: account.id })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
    nock.abortPendingRequests()
  })

  it('fails if account query response is invalid', async () => {
    // Account not an object
    const scope = nock(accountUrl.origin)
      .get(accountUrl.pathname)
      .matchHeader('Accept', /application\/json/)
      .reply(200, '"this is a string"')
    await expect(fetchPaymentDetails({ destinationAccount: account.id })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
  })

  it('fails if account id in query response is invalid', async () => {
    // Account not an object
    const scope = nock(accountUrl.origin)
      .get(accountUrl.pathname)
      .matchHeader('Accept', /application\/json/)
      .reply(200, { ...account, id: 'helloworld' })
    await expect(fetchPaymentDetails({ destinationAccount: account.id })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
  })

  it('fails if trying to pay to open payments account', async () => {
    const accountScope = nock(accountUrl.origin)
      .get(accountUrl.pathname)
      .matchHeader('Accept', /application\/json/)
      .reply(200, account)
    await expect(fetchPaymentDetails({ destinationAccount: account.id })).resolves.toBe(
      PaymentError.InvalidDestination
    )
    accountScope.done()
  })

  it('resolves credentials from connection url', async () => {
    const connectionId = uuid()
    const scope = nock('https://wallet.com')
      .get(`/${connectionId}`)
      .matchHeader('Accept', 'application/json')
      .reply(200, {
        id: `https://wallet.com/${connectionId}`,
        ilpAddress: destinationAddress,
        sharedSecret: sharedSecretBase64,
      })

    const credentials = await fetchPaymentDetails({
      destinationConnection: `https://wallet.com/${connectionId}`,
    })
    expect(credentials).toMatchObject({
      sharedSecret,
      destinationAddress,
    })
    scope.done()
  })

  it('fails if connection query fails', async () => {
    const connectionId = uuid()
    const scope = nock('https://wallet.com').get(`/${connectionId}`).reply(500)
    await expect(
      fetchPaymentDetails({ destinationConnection: `https://wallet.com/${connectionId}` })
    ).resolves.toBe(PaymentError.QueryFailed)
    scope.done()
  })

  it('fails if connection url in payment pointer', async () => {
    await expect(
      fetchPaymentDetails({ destinationConnection: `$wallet.com/${uuid()}` })
    ).resolves.toBe(PaymentError.QueryFailed)
  })

  it('fails if connection query times out', async () => {
    const connectionId = uuid()
    const scope = nock('https://wallet.com').get(`/${connectionId}`).delay(7000).reply(500)
    await expect(
      fetchPaymentDetails({ destinationConnection: `https://wallet.com/${connectionId}` })
    ).resolves.toBe(PaymentError.QueryFailed)
    scope.done()
    nock.abortPendingRequests()
  })

  it('fails if connection query response is invalid', async () => {
    // Invalid shared secret
    const connectionId = uuid()
    const scope = nock('https://wallet.com')
      .get(`/${connectionId}`)
      .reply(200, {
        id: `https://wallet.com/${connectionId}`,
        ilpAddress: 'g.foo',
        sharedSecret: 'Zm9v',
      })
    await expect(
      fetchPaymentDetails({ destinationConnection: `https://wallet.com/${connectionId}` })
    ).resolves.toBe(PaymentError.QueryFailed)
    scope.done()

    // connection response not an object
    const scope2 = nock('https://wallet.com').get(`/${connectionId}`).reply(200, '3')
    await expect(
      fetchPaymentDetails({ destinationConnection: `https://wallet.com/${connectionId}` })
    ).resolves.toBe(PaymentError.QueryFailed)
    scope2.done()
  })

  it('resolves credentials from SPSP', async () => {
    const scope = nock('https://alice.mywallet.com')
      .get('/.well-known/pay')
      .matchHeader('Accept', /application\/spsp4\+json*./)
      .delay(1000)
      .reply(200, {
        destination_account: destinationAddress,
        shared_secret: sharedSecretBase64,
      })

    const credentials = await fetchPaymentDetails({ destinationAccount: '$alice.mywallet.com' })
    expect(credentials).toMatchObject({
      sharedSecret,
      destinationAddress,
      accountUrl: 'https://alice.mywallet.com/.well-known/pay',
    })
    scope.done()
  })

  it('fails if SPSP query fails', async () => {
    const scope = nock('https://open.mywallet.com').get(/.*/).reply(500)
    await expect(fetchPaymentDetails({ destinationAccount: '$open.mywallet.com' })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
  })

  it('fails if SPSP query times out', async () => {
    const scope = nock('https://open.mywallet.com').get(/.*/).delay(7000).reply(500)
    await expect(fetchPaymentDetails({ destinationAccount: '$open.mywallet.com' })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope.done()
    nock.abortPendingRequests()
  })

  it('fails if SPSP query response is invalid', async () => {
    // Invalid shared secret
    const scope2 = nock('https://alice.mywallet.com').get('/.well-known/pay').reply(200, {
      destination_account: 'g.foo',
      shared_secret: 'Zm9v',
    })
    await expect(fetchPaymentDetails({ destinationAccount: '$alice.mywallet.com' })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope2.done()

    // SPSP account not an object
    const scope3 = nock('https://wallet.example').get('/.well-known/pay').reply(200, '3')
    await expect(fetchPaymentDetails({ destinationAccount: '$wallet.example' })).resolves.toBe(
      PaymentError.QueryFailed
    )
    scope3.done()
  })

  it('follows SPSP redirect', async () => {
    const scope1 = nock('https://wallet1.example/').get('/.well-known/pay').reply(
      307, // Temporary redirect
      {},
      {
        Location: 'https://wallet2.example/.well-known/pay',
      }
    )

    const scope2 = nock('https://wallet2.example/')
      .get('/.well-known/pay')
      .matchHeader('Accept', /application\/spsp4\+json*./)
      .reply(200, { destination_account: destinationAddress, shared_secret: sharedSecretBase64 })

    const credentials = await fetchPaymentDetails({ destinationAccount: '$wallet1.example' })
    expect(credentials).toMatchObject({
      sharedSecret,
      destinationAddress,
    })
    scope1.done()
    scope2.done()
  })

  it('fails on SPSP redirect to non-HTTPS endpoint', async () => {
    const scope1 = nock('https://wallet1.example/').get('/.well-known/pay').reply(
      302, // Temporary redirect
      {},
      {
        Location: 'http://wallet2.example/.well-known/pay',
      }
    )

    const scope2 = nock('https://wallet2.example/').get('/.well-known/pay').reply(
      302, // Temporary redirect
      {},
      {
        Location: 'http://wallet3.example/.well-known/pay',
      }
    )

    await expect(fetchPaymentDetails({ destinationAccount: '$wallet1.example' })).resolves.toBe(
      PaymentError.QueryFailed
    )

    // Only the first request, should be resolved, ensure it doesn't follow insecure redirect
    expect(scope1.isDone())
    expect(!scope2.isDone())
    nock.cleanAll()
  })

  it('fails if the payment pointer is semantically invalid', async () => {
    await expect(fetchPaymentDetails({ destinationAccount: 'ht$tps://example.com' })).resolves.toBe(
      PaymentError.InvalidPaymentPointer
    )
  })

  it('fails if query part is included', async () => {
    await expect(fetchPaymentDetails({ destinationAccount: '$foo.co?id=12345678' })).resolves.toBe(
      PaymentError.InvalidPaymentPointer
    )
  })

  it('fails if fragment part is included', async () => {
    await expect(
      fetchPaymentDetails({ destinationAccount: '$interledger.org#default' })
    ).resolves.toBe(PaymentError.InvalidPaymentPointer)
  })

  it('fails if account URL is not HTTPS or HTTP', async () => {
    await expect(
      fetchPaymentDetails({ destinationAccount: 'oops://ilp.wallet.com/alice' })
    ).resolves.toBe(PaymentError.InvalidPaymentPointer)
  })

  it('validates given STREAM credentials', async () => {
    const sharedSecret = randomBytes(32)
    const destinationAddress = 'test.foo.~hello~world'
    await expect(fetchPaymentDetails({ sharedSecret, destinationAddress })).resolves.toMatchObject({
      sharedSecret,
      destinationAddress,
    })
  })

  it('fails if provided invalid STREAM credentials', async () => {
    await expect(
      fetchPaymentDetails({ sharedSecret: randomBytes(31), destinationAddress: 'private' })
    ).resolves.toBe(PaymentError.InvalidCredentials)
  })

  it('fails if no mechanism to fetch STREAM credentials was provided', async () => {
    await expect(fetchPaymentDetails({})).resolves.toBe(PaymentError.InvalidCredentials)
  })
})

describe('setup flow', () => {
  it('fails if given no payment pointer or STREAM credentials', async () => {
    await expect(
      setupPayment({
        plugin: new MirrorPlugin(),
      })
    ).rejects.toBe(PaymentError.InvalidCredentials)
  })

  it('fails given a semantically invalid payment pointer', async () => {
    await expect(
      setupPayment({
        plugin: new MirrorPlugin(),
        destinationAccount: 'ht$tps://example.com',
      })
    ).rejects.toBe(PaymentError.InvalidPaymentPointer)
  })

  it('fails if payment pointer cannot resolve', async () => {
    await expect(
      setupPayment({
        plugin: new MirrorPlugin(),
        destinationAccount: 'https://wallet.co/foo/bar',
      })
    ).rejects.toBe(PaymentError.QueryFailed)
  })

  it('fails if SPSP response is invalid', async () => {
    const scope = nock('https://example4.com').get('/foo').reply(200, { meh: 'why?' })

    await expect(
      setupPayment({
        plugin: new MirrorPlugin(),
        destinationAccount: 'https://example4.com/foo',
      })
    ).rejects.toBe(PaymentError.QueryFailed)
    scope.done()
  })

  it('establishes connection from SPSP and fetches asset details with STREAM', async () => {
    const [senderPlugin1, senderPlugin2] = MirrorPlugin.createPair()
    const [receiverPlugin1, receiverPlugin2] = MirrorPlugin.createPair()

    const app = createApp({
      ilpAddress: 'private.larry',
      backend: 'one-to-one',
      spread: 0,
      accounts: {
        sender: {
          relation: 'child',
          assetCode: 'ABC',
          assetScale: 0,
          plugin: senderPlugin2,
        },
        receiver: {
          relation: 'child',
          assetCode: 'XYZ',
          assetScale: 0,
          plugin: receiverPlugin1,
        },
      },
    })
    await app.listen()

    const streamServer = await createServer({
      plugin: receiverPlugin2,
    })

    const connectionHandler = jest.fn()
    streamServer.on('connection', connectionHandler)

    const scope = nock('https://example5.com')
      .get('/.well-known/pay')
      .matchHeader('Accept', /application\/spsp4\+json*./)
      .reply(() => {
        const credentials = streamServer.generateAddressAndSecret()

        return [
          200,
          {
            destination_account: credentials.destinationAccount,
            shared_secret: credentials.sharedSecret.toString('base64'),
          },
          { 'Content-Type': 'application/spsp4+json' },
        ]
      })

    const details = await setupPayment({
      destinationAccount: 'https://example5.com',
      plugin: senderPlugin1,
    })

    expect(details.destinationAsset).toMatchObject({
      code: 'XYZ',
      scale: 0,
    })

    // Connection should be able to be established after resolving payment pointer
    expect(connectionHandler.mock.calls.length).toBe(1)
    scope.done()

    await app.shutdown()
    await streamServer.close()
  })

  it('fails on asset detail conflicts', async () => {
    const sharedSecret = randomBytes(32)
    const encryptionKey = generateEncryptionKey(sharedSecret)

    // Create simple STREAM receiver that acks test packets,
    // but replies with conflicting asset details
    const plugin = createPlugin(async (prepare) => {
      const streamRequest = await Packet.decryptAndDeserialize(encryptionKey, prepare.data)
      const streamReply = new Packet(streamRequest.sequence, IlpPacketType.Reject, prepare.amount, [
        new ConnectionAssetDetailsFrame('ABC', 2),
        new ConnectionAssetDetailsFrame('XYZ', 2),
        new ConnectionAssetDetailsFrame('XYZ', 3),
      ])

      return {
        code: IlpError.F99_APPLICATION_ERROR,
        message: '',
        triggeredBy: '',
        data: await streamReply.serializeAndEncrypt(encryptionKey),
      }
    })

    await expect(
      setupPayment({
        plugin: plugin,
        destinationAddress: 'private.larry.receiver',
        sharedSecret,
      })
    ).rejects.toBe(PaymentError.DestinationAssetConflict)
  })

  it('fails on asset probe if cannot establish connection', async () => {
    const plugin = createPlugin(async () => ({
      code: IlpError.T01_PEER_UNREACHABLE,
      message: '',
      triggeredBy: '',
      data: Buffer.alloc(0),
    }))

    await expect(
      setupPayment({
        plugin,
        destinationAddress: 'private.larry.receiver',
        sharedSecret: Buffer.alloc(32),
      })
    ).rejects.toBe(PaymentError.EstablishmentFailed)
  }, 15_000)
})

describe('quoting flow', () => {
  it('fails if amount to send is not a positive integer', async () => {
    const asset = {
      code: 'ABC',
      scale: 4,
    }
    const destination = await setupPayment({
      plugin,
      destinationAsset: asset,
      destinationAddress: 'private.foo',
      sharedSecret: Buffer.alloc(32),
    })

    // Fails with negative source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: BigInt(-2),
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)

    // Fails with fractional source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: '3.14',
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)

    // Fails with 0 source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 0,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)

    // Fails with `NaN` source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: NaN,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)

    // Fails with `Infinity` source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: Infinity,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)

    // Fails with Int if source amount is 0
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: BigInt(0),
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSourceAmount)
  })

  it('fails if amount to deliver is not a positive integer', async () => {
    const asset = {
      code: 'ABC',
      scale: 4,
    }
    const destination = await setupPayment({
      plugin,
      destinationAsset: asset,
      destinationAddress: 'private.foo',
      sharedSecret: Buffer.alloc(32),
    })

    // Fails with negative source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: BigInt(-3),
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)

    // Fails with fractional source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: '3.14',
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)

    // Fails with 0 source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: 0,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)

    // Fails with `NaN` source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: NaN,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)

    // Fails with `Infinity` source amount
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: Infinity,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)

    // Fails with Int if source amount is 0
    await expect(
      startQuote({
        plugin,
        destination,
        amountToDeliver: BigInt(0),
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidDestinationAmount)
  })

  it('fails if no Incoming Payment, amount to send or deliver was provided', async () => {
    const plugin = new MirrorPlugin()
    const asset = {
      code: 'ABC',
      scale: 3,
    }

    const destination = await setupPayment({
      plugin,
      destinationAddress: 'private.receiver',
      destinationAsset: asset,
      sharedSecret: randomBytes(32),
    })
    await expect(
      startQuote({
        plugin,
        destination,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.UnknownPaymentTarget)
  })

  it('fails on quote if no test packets are delivered', async () => {
    const plugin = createPlugin(async () => ({
      code: IlpError.T01_PEER_UNREACHABLE,
      message: '',
      triggeredBy: '',
      data: Buffer.alloc(0),
    }))

    const asset = {
      code: 'USD',
      scale: 6,
    }

    const destination = await setupPayment({
      plugin,
      destinationAddress: 'private.larry.receiver',
      destinationAsset: asset,
      sharedSecret: Buffer.alloc(32),
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: '1000',
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.RateProbeFailed)
  }, 15_000)

  it('fails if max packet amount is 0', async () => {
    const destinationAddress = 'private.receiver'
    const sharedSecret = randomBytes(32)

    const plugin = createPlugin(createMaxPacketMiddleware(Int.ZERO))

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      destinationAsset: {
        code: 'ABC',
        scale: 0,
      },
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 1000,
        sourceAsset: {
          code: 'ABC',
          scale: 0,
        },
      })
    ).rejects.toBe(PaymentError.ConnectorError)
  })

  it('fails if receiver never shared destination asset details', async () => {
    const plugin = createPlugin(streamReceiver)

    // Server will not reply with asset details since none were provided
    const credentials = streamServer.generateCredentials()

    await expect(
      setupPayment({
        plugin,
        destinationAddress: credentials.ilpAddress,
        sharedSecret: credentials.sharedSecret,
      })
    ).rejects.toBe(PaymentError.UnknownDestinationAsset)
  })

  it('fails if prices were not provided', async () => {
    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials()

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      destinationAsset: {
        code: 'GBP',
        scale: 0,
      },
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 100,
        sourceAsset: {
          code: 'JPY',
          scale: 0,
        },
      })
    ).rejects.toBe(PaymentError.ExternalRateUnavailable)
  })

  it('fails if slippage is invalid', async () => {
    const asset = {
      code: 'ABC',
      scale: 2,
    }

    const destination = await setupPayment({
      plugin,
      sharedSecret: Buffer.alloc(32),
      destinationAddress: 'g.recipient',
      destinationAsset: asset,
    })

    await expect(
      startQuote({
        plugin,
        destination,
        slippage: NaN,
        amountToSend: 10,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSlippage)

    await expect(
      startQuote({
        plugin,
        destination,
        slippage: Infinity,
        amountToSend: 10,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSlippage)

    await expect(
      startQuote({
        plugin,
        destination,
        slippage: 1.2,
        amountToSend: 10,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSlippage)

    await expect(
      startQuote({
        plugin,
        destination,
        slippage: -0.0001,
        amountToSend: 10,
        sourceAsset: asset,
      })
    ).rejects.toBe(PaymentError.InvalidSlippage)
  })

  it('fails if source asset details are invalid', async () => {
    const asset = {
      code: 'ABC',
      scale: 2,
    }

    const destination = await setupPayment({
      plugin,
      sharedSecret: Buffer.alloc(32),
      destinationAddress: 'g.recipient',
      destinationAsset: asset,
    })

    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 10,
        sourceAsset: {
          code: 'ABC',
          scale: NaN,
        },
      })
    ).rejects.toBe(PaymentError.UnknownSourceAsset)

    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 10,
        sourceAsset: {
          code: 'KRW',
          scale: Infinity,
        },
      })
    ).rejects.toBe(PaymentError.UnknownSourceAsset)

    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 10,
        sourceAsset: {
          code: 'CNY',
          scale: -20,
        },
      })
    ).rejects.toBe(PaymentError.UnknownSourceAsset)

    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 10,
        sourceAsset: {
          code: 'USD',
          scale: 256,
        },
      })
    ).rejects.toBe(PaymentError.UnknownSourceAsset)
  })

  it('fails if no external price for the source asset exists', async () => {
    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials({
      asset: {
        code: 'ABC',
        scale: 0,
      },
    })

    const plugin = createPlugin(streamReceiver)

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 100,
        sourceAsset: {
          code: 'some really weird currency',
          scale: 0,
        },
      })
    ).rejects.toBe(PaymentError.ExternalRateUnavailable)
  })

  it('fails if no external price for the destination asset exists', async () => {
    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials({
      asset: {
        code: 'THIS_ASSET_CODE_DOES_NOT_EXIST',
        scale: 0,
      },
    })

    const plugin = createPlugin(streamReceiver)

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: 100,
        sourceAsset: {
          code: 'USD',
          scale: 3,
        },
      })
    ).rejects.toBe(PaymentError.ExternalRateUnavailable)
  })

  it('fails if the external exchange rate is 0', async () => {
    const plugin = createPlugin(streamReceiver)

    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials({
      asset: {
        code: 'XYZ',
        scale: 0,
      },
    })

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: '1000',
        sourceAsset: {
          code: 'ABC',
          scale: 0,
        },
        prices: {
          // Computing this rate would be a divide-by-0 error,
          // so the rate is "unavailable" rather than quoted as 0
          ABC: 1,
          XYZ: 0,
        },
      })
    ).rejects.toBe(PaymentError.ExternalRateUnavailable)
  })

  it('fails it the probed rate is below the minimum rate', async () => {
    const plugin = createPlugin(createSlippageMiddleware(0.02), streamReceiver)

    const asset = {
      code: 'ABC',
      scale: 4,
    }

    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials()

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      destinationAsset: asset,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: '1000',
        sourceAsset: asset,
        slippage: 0.01,
      })
    ).rejects.toBe(PaymentError.InsufficientExchangeRate)
  })

  it('fails if the probed rate is 0', async () => {
    const sourceAsset = {
      code: 'BTC',
      scale: 8,
    }
    const destinationAsset = {
      code: 'EUR',
      scale: 0,
    }
    const prices = {
      BTC: 9814.04,
      EUR: 1.13,
    }

    const plugin = createPlugin(
      createMaxPacketMiddleware(Int.from(1000)!),
      createRateMiddleware(new RateBackend(sourceAsset, destinationAsset, prices)),
      streamReceiver
    )

    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials()

    const destination = await setupPayment({
      plugin,
      destinationAddress,
      destinationAsset,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin,
        destination,
        amountToSend: '1000',
        sourceAsset,
        prices,
      })
    ).rejects.toBe(PaymentError.InsufficientExchangeRate)
  })

  it('fails if probed rate is very close to the minimum', async () => {
    const [senderPlugin1, senderPlugin2] = MirrorPlugin.createPair()
    const [receiverPlugin1, receiverPlugin2] = MirrorPlugin.createPair()

    const prices = {
      BTC: 9814.04,
      EUR: 1.13,
    }

    // Override with rate backend for custom rates
    let backend: CustomBackend
    const deps = reduct((Constructor) => Constructor.name === 'RateBackend' && backend)
    backend = new CustomBackend(deps)
    backend.setPrices(prices)

    const sourceAsset = {
      assetCode: 'BTC',
      assetScale: 8,
    }

    const app = createApp(
      {
        ilpAddress: 'private.larry',
        spread: 0.0005,
        accounts: {
          sender: {
            relation: 'child',
            plugin: senderPlugin2,
            maxPacketAmount: '1000',
            ...sourceAsset,
          },
          receiver: {
            relation: 'child',
            assetCode: 'EUR',
            assetScale: 6,
            plugin: receiverPlugin1,
          },
        },
      },
      deps
    )
    await app.listen()

    const streamServer = await createServer({
      plugin: receiverPlugin2,
    })

    const { sharedSecret, destinationAccount: destinationAddress } =
      streamServer.generateAddressAndSecret()

    streamServer.on('connection', (conn: Connection) => {
      conn.on('stream', (stream: DataAndMoneyStream) => {
        stream.setReceiveMax(Long.MAX_UNSIGNED_VALUE)
      })
    })

    const destination = await setupPayment({
      plugin: senderPlugin1,
      destinationAddress,
      sharedSecret,
    })
    await expect(
      startQuote({
        plugin: senderPlugin1,
        destination,
        amountToSend: 100_000,
        sourceAsset: {
          code: 'BTC',
          scale: 8,
        },
        // Slippage/minExchangeRate is far too close to the real spread/rate
        // to perform the payment without rounding errors, since the max packet
        // amount of 1000 doesn't allow more precision.
        slippage: 0.0005001,
        prices,
      })
    ).rejects.toBe(PaymentError.InsufficientExchangeRate)

    await app.shutdown()
    await streamServer.close()
  })

  it('discovers precise max packet amount from F08s without metadata', async () => {
    const maxPacketAmount = 300324
    let largestAmountReceived = 0

    let numberOfPackets = 0

    const plugin = createPlugin(
      // Tests the max packet state transition from precise -> imprecise
      createMaxPacketMiddleware(Int.from(1_000_000)!),
      // Add middleware to return F08 errors *without* metadata
      // and track the greatest packet amount that's sent
      async (prepare, next) => {
        numberOfPackets++

        if (+prepare.amount > maxPacketAmount) {
          return {
            code: IlpError.F08_AMOUNT_TOO_LARGE,
            message: '',
            triggeredBy: '',
            data: Buffer.alloc(0),
          }
        } else {
          largestAmountReceived = Math.max(largestAmountReceived, +prepare.amount)
          return next(prepare)
        }
      },
      streamReceiver
    )

    const asset = {
      code: 'ABC',
      scale: 0,
    }

    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials()

    const destination = await setupPayment({
      plugin,
      sharedSecret,
      destinationAddress,
      destinationAsset: asset,
    })
    const { maxPacketAmount: discoveredMaxPacket } = await startQuote({
      plugin,
      destination,
      amountToSend: 40_000_000,
      sourceAsset: asset,
    })

    // If STREAM did discover the max packet amount,
    // since the rate is 1:1, the largest packet the receiver got
    // should be exactly the max packet amount
    expect(largestAmountReceived).toBe(maxPacketAmount)
    expect(discoveredMaxPacket.toString()).toBe(maxPacketAmount.toString())

    // It should take relatively few packets to complete the binary search.
    // Checks against duplicate amounts being sent in parallel
    expect(numberOfPackets).toBeLessThan(40)
  }, 10_000)

  it('supports 1:1 rate with no max packet amount', async () => {
    const plugin = createPlugin(streamReceiver)
    const { sharedSecret, ilpAddress: destinationAddress } = streamServer.generateCredentials()
    const asset = {
      code: 'ABC',
      scale: 0,
    }

    const destination = await setupPayment({
      plugin,
      sharedSecret,
      destinationAddress,
      destinationAsset: asset,
    })
    const { maxPacketAmount } = await startQuote({
      plugin,
      destination,
      amountToSend: 10,
      sourceAsset: asset,
    })
    expect(maxPacketAmount).toBe(Int.MAX_U64.value)
  })
})
