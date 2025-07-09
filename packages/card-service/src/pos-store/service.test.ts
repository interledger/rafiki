import { createPOSStore } from './service'
import Redis from 'ioredis'
import { Logger } from 'pino'

describe('POS Store Service', () => {
  let redis: jest.Mocked<Redis>
  let logger: jest.Mocked<Logger>
  let service: ReturnType<typeof createPOSStore>

  const requestId = 'req-123'
  const POSHost = 'pos.example.com'

  beforeEach(() => {
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn()
    } as unknown as jest.Mocked<Redis>
    logger = {
      child: jest.fn().mockReturnThis(),
      info: jest.fn(),
      error: jest.fn()
    } as unknown as jest.Mocked<Logger>
    service = createPOSStore({ redis, logger })
  })

  describe('addPOS', () => {
    it('should add a POS for a requestId', async () => {
      await service.addPOS(requestId, POSHost)
      expect(redis.set).toHaveBeenCalledWith(requestId, POSHost, 'EX', 300)
      expect(logger.info).toHaveBeenCalledWith(
        { requestId, POSHost },
        'POS was added for the given requestId'
      )
    })

    it('should clear the POS after 5 minutes (TTL)', async () => {
      jest.useFakeTimers()
      redis.set.mockResolvedValue('OK')
      redis.get.mockResolvedValueOnce(POSHost) // Before TTL
      redis.get.mockResolvedValueOnce(null) // After TTL

      await service.addPOS(requestId, POSHost)
      expect(redis.set).toHaveBeenCalledWith(requestId, POSHost, 'EX', 300)

      await expect(service.getPOS(requestId)).resolves.toBe(POSHost)

      jest.advanceTimersByTime(300 * 1000)
      await expect(service.getPOS(requestId)).rejects.toThrow(
        `No POS found for requestId: ${requestId}`
      )
      jest.useRealTimers()
    })
  })

  describe('getPOS', () => {
    it('should return the POSHost for a requestId', async () => {
      redis.get.mockResolvedValue(POSHost)
      await expect(service.getPOS(requestId)).resolves.toBe(POSHost)
    })
    it('should throw if no POS found', async () => {
      redis.get.mockResolvedValue(null)
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
      redis.del.mockResolvedValue(1)
      await service.deletePOS(requestId)
      expect(redis.del).toHaveBeenCalledWith([requestId])
      expect(logger.info).toHaveBeenCalledWith(
        `POS record was deleted for requestId: ${requestId}`
      )
    })
    it('should throw if no POS record was deleted', async () => {
      redis.del.mockResolvedValue(0)
      await expect(service.deletePOS(requestId)).rejects.toThrow(
        `No POS record was deleted for requestId: ${requestId}`
      )
      expect(logger.error).toHaveBeenCalledWith(
        `No POS record was deleted for requestId: ${requestId}`
      )
    })
  })
})
