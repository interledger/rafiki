// Jest environment configuration for point-of-sale
process.env.NODE_ENV = 'test'
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent'

process.env.TENANT_ID = 'tenant_id'
process.env.TENANT_SECRET = 'tenant_secret'
process.env.TENANT_SIGNATURE_VERSION = 'tenant_signature_version'
process.env.GRAPHQL_URL = 'http://127.0.0.1:3003/graphq'
