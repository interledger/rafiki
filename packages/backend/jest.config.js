'use strict'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../../jest.config.base.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = require('./package.json').name

process.env.LOG_LEVEL = 'silent'
process.env.INSTANCE_NAME = 'Rafiki'
process.env.KEY_ID = 'myKey'
process.env.OPEN_PAYMENTS_URL = 'http://127.0.0.1:3000'
process.env.ILP_CONNECTOR_URL = 'http://127.0.0.1:3002'
process.env.ILP_ADDRESS = 'test.rafiki'
process.env.AUTH_SERVER_GRANT_URL = 'http://127.0.0.1:3006'
process.env.AUTH_SERVER_INTROSPECTION_URL = 'http://127.0.0.1:3007/'
process.env.WEBHOOK_URL = 'http://127.0.0.1:4001/webhook'
process.env.STREAM_SECRET = '2/PxuRFV9PAp0yJlnAifJ+1OxujjjI16lN+DBnLNRLA='
process.env.USE_TIGERBEETLE = false
process.env.ENABLE_TELEMETRY = false
process.env.KRATOS_ADMIN_URL = 'http://127.0.0.1:4434/admin'
process.env.KRATOS_ADMIN_EMAIL = 'admin@mail.com'
process.env.AUTH_ADMIN_URL = 'http://example.com/graphql'
process.env.AUTH_ADMIN_API_SECRET = 'verysecuresecret'

module.exports = {
  ...baseConfig,
  clearMocks: true,
  testTimeout: 30000,
  roots: [`<rootDir>/packages/${packageName}`],
  globalSetup: `<rootDir>/packages/${packageName}/jest.setup.ts`,
  globalTeardown: `<rootDir>/packages/${packageName}/jest.teardown.js`,
  testRegex: `(packages/${packageName}/.*/__tests__/.*|\\.(test|spec))\\.tsx?$`,
  testEnvironment: `<rootDir>/packages/${packageName}/jest.custom-environment.ts`,
  moduleDirectories: [
    `node_modules`,
    `packages/${packageName}/node_modules`,
    `<rootDir>/node_modules`
  ],
  modulePaths: [
    `node_modules`,
    `<rootDir>/packages/${packageName}/src/`,
    `<rootDir>/node_modules`
  ],
  id: packageName,
  displayName: packageName,
  rootDir: '../..'
}
