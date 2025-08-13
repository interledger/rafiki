// Jest environment configuration for card-service
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent'
process.env.CARD_PAYMENT_TIMEOUT_MS = '50'
