'use strict'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../../jest.config.base.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = require('./package.json').name

module.exports = {
  ...baseConfig,
  clearMocks: true,
  testTimeout: 30000,
  roots: [`<rootDir>/packages/${packageName}`],
  globalSetup: `<rootDir>/packages/${packageName}/jest.setup.js`,
  globalTeardown: `<rootDir>/packages/${packageName}/jest.teardown.js`,
  testRegex: `(packages/${packageName}/.*/__tests__/.*|\\.(test|spec))\\.tsx?$`,
  moduleDirectories: [`node_modules`, `packages/${packageName}/node_modules`],
  modulePaths: [`<rootDir>/packages/${packageName}/src/`],
  setupFiles: [`<rootDir>/packages/${packageName}/jest.env.js`],
  id: packageName,
  displayName: packageName,
  rootDir: '../..'
}
