import { createPOSStore } from './service'
import Redis from 'ioredis'
import { Logger } from 'pino'

describe('POS Store Service', () => {
  let redis: Redis
  let logger: jest.Mocked<Logger>
  let service: ReturnType<typeof createPOSStore>

  const requestId = 'req-123'
  const POSHost = 'pos.example.com'

  beforeAll(async () => {
    redis = new Redis(process.env.REDIS_URL!)
    await redis.ping()
  })

  beforeEach(async () => {
    await redis.flushall()
    logger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn()
    } as unknown as jest.Mocked<Logger>
    service = createPOSStore({ redis, logger })
  })

  afterAll(async () => {
    await redis.quit()
  })

  describe('addPOS', () => {
    it('should add a POS for a requestId', async () => {
      await service.addPOS(requestId, POSHost)
      const value = await redis.get(requestId)
      expect(value).toBe(POSHost)
      expect(logger.info).toHaveBeenCalledWith(
        { requestId, POSHost },
        'POS was added for the given requestId'
      )
    })

    it('should clear the POS after 5 minutes (TTL)', async () => {
      jest.useFakeTimers()
      await service.addPOS(requestId, POSHost)
      expect(await redis.get(requestId)).toBe(POSHost)

      await expect(service.getPOS(requestId)).resolves.toBe(POSHost)

      jest.advanceTimersByTime(300 * 1000)
      // Simulate TTL expiry by manually deleting the key (since fake timers don't affect Redis TTL)
      await redis.del(requestId)
      await expect(service.getPOS(requestId)).rejects.toThrow(
        `No POS found for requestId: ${requestId}`
      )
      jest.useRealTimers()
    })
  })

  describe('getPOS', () => {
    it('should return the POSHost for a requestId', async () => {
      await redis.set(requestId, POSHost, 'EX', 300)
      await expect(service.getPOS(requestId)).resolves.toBe(POSHost)
    })
    it('should throw if no POS found', async () => {
      await redis.del(requestId)
      await expect(service.getPOS(requestId)).rejects.toThrow(
        `No POS found for requestId: ${requestId}`
      )
      expect(logger.error).toHaveBeenCalledWith(
        { requestId: 'req-123' },
        'No POS found for requestId'
      )
    })
  })

  describe('deletePOS', () => {
    it('should delete the POS record for a requestId', async () => {
      await redis.set(requestId, POSHost, 'EX', 300)
      await service.deletePOS(requestId)
      const value = await redis.get(requestId)
      expect(value).toBe(null)
      expect(logger.info).toHaveBeenCalledWith(
        `POS record was deleted for requestId: ${requestId}`
      )
    })
    it('should throw if no POS record was deleted', async () => {
      await redis.del(requestId)
      await expect(service.deletePOS(requestId)).rejects.toThrow(
        `No POS record was deleted for requestId: ${requestId}`
      )
      expect(logger.error).toHaveBeenCalledWith(
        `No POS record was deleted for requestId: ${requestId}`
      )
    })
  })
})
