import {
  CardServiceClient,
  SendPaymentArgs,
  PaymentResponse,
  Result,
  createCardServiceClient
} from './client'
import nock from 'nock'
import { HttpStatusCode } from 'axios'
import { initIocContainer } from '..'
import { Config } from '../config/app'
import { faker } from '@faker-js/faker'

describe('CardServiceClient', () => {
  const CARD_SERVICE_URL = 'http://card-service.com'
  let client: CardServiceClient

  beforeEach(async () => {
    const deps = initIocContainer(Config)
    client = await createCardServiceClient({
      logger: await deps.use('logger'),
      axios: await deps.use('axios')
    })
    nock.cleanAll()
  })

  afterEach(() => {
    expect(nock.isDone()).toBeTruthy()
  })

  const createPaymentResponse = (resultCode?: Result): PaymentResponse => ({
    requestId: 'requestId',
    result: { code: resultCode || Result.APPROVED }
  })

  const options: SendPaymentArgs = {
    incomingPaymentUrl: 'incomingPaymentUrl',
    senderWalletAddress: faker.internet.url(),
    timestamp: new Date().getTime(),
    signature: '',
    payload: '',
    amount: {
      assetCode: 'USD',
      assetScale: 2,
      value: '100'
    }
  }

  test('returns the result', async () => {
    const resultCode = Result.APPROVED
    nock(CARD_SERVICE_URL)
      .post('/payment')
      .reply(201, createPaymentResponse(resultCode))

    await expect(client.sendPayment(CARD_SERVICE_URL, options)).resolves.toBe(
      resultCode
    )
  })

  test('throws when there is no payload data', async () => {
    nock(CARD_SERVICE_URL).post('/payment').reply(HttpStatusCode.Ok, undefined)
    await expect(
      client.sendPayment(CARD_SERVICE_URL, options)
    ).rejects.toMatchObject({
      status: HttpStatusCode.NotFound,
      message: 'No payment information was received'
    })
  })

  test('throws when there is an issue with the request', async () => {
    nock(CARD_SERVICE_URL)
      .post('/payment')
      .reply(HttpStatusCode.ServiceUnavailable, 'Something went wrong')
    await expect(
      client.sendPayment(CARD_SERVICE_URL, options)
    ).rejects.toMatchObject({
      status: HttpStatusCode.ServiceUnavailable,
      message: 'Something went wrong'
    })
  })
})
