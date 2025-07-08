import { createPOSStore, StoreDependencies } from './service'
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
      expect(redis.set).toHaveBeenCalledWith(requestId, POSHost)
      expect(logger.info).toHaveBeenCalledWith(
        `POS ${POSHost} was added for requestId: ${requestId}`
      )
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
        `No POS found for requestId: ${requestId}`
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