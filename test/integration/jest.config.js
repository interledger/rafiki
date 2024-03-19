'use strict'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const baseConfig = require('../../jest.config.base.js')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = require('./package.json').name

module.exports = {
  ...baseConfig,
  clearMocks: true,
  roots: [`<rootDir>/test/${packageName}`],
  moduleDirectories: [`node_modules`, `test/${packageName}/node_modules`],
  id: packageName,
  displayName: packageName,
  rootDir: '../..'
}
