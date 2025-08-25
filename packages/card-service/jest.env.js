// Jest environment configuration for card-service
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent'
process.env.CARD_PAYMENT_TIMEOUT_MS = '50'
process.env.TENANT_ID = 'tenant_id'
process.env.TENANT_SECRET = 'tenant_secret'
process.env.TENANT_SIGNATURE_VERSION = 'tenant_signature_version'
process.env.GRAPHQL_URL = 'http://127.0.0.1:3003/graphql'
