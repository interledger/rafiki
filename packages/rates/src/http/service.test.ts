import Axios from 'axios'
import { config } from '../config'
import { createHTTPService, HTTPService } from './service'

const axios = Axios.create({ baseURL: `http://127.0.0.1:${config.port}` })

describe('HTTP Service', function () {
  let service: HTTPService

  beforeAll(async () => {
    service = await createHTTPService({
      config,
      logger: {
        debug: () => jest.fn(),
        fatal: () => jest.fn(),
        error: () => jest.fn(),
        warn: () => jest.fn(),
        info: () => jest.fn(),
        trace: () => jest.fn()
      },
      ecbService: { fetchPrices: async () => ({ EUR: 1.0, FOO: 2.0 }) },
      xrpService: { fetchPrice: async () => 5.0 }
    })
  })

  afterAll(async () => {
    await new Promise((resolve) => service.close(resolve))
  })

  describe('GET /healthz', function () {
    it('returns 200', async () => {
      const res = await axios.get('/healthz')
      expect(res.status).toBe(200)
    })
  })

  describe('GET /prices', function () {
    it('returns prices', async () => {
      const res = await axios.get('/prices')
      expect(res.status).toBe(200)
      expect(res.headers['content-type']).toBe(
        'application/json; charset=utf-8'
      )
      expect(res.data).toEqual({
        EUR: 1.0,
        FOO: 2.0,
        XRP: 5.0
      })
    })
  })
})
