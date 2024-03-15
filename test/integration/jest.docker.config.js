// TODO: this just inlines the baseconfig here to make it easier to port to docker.
// however, this means running locally (on non-docker config) could diverge
// fromm running on docker when baseConfig is updated.
// Should probably copy baseConfig over to docker and use the regular jest.config.js

'use strict'
// eslint-disable-next-line @typescript-eslint/no-var-requires
const packageName = require('./package.json').name

module.exports = {
  transform: {
    '^.+\\.tsx?$': ['@swc/jest']
  },
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', './'],
  modulePaths: ['node_modules', './'],
  workerThreads: true,
  clearMocks: true,
  roots: [`<rootDir>/test/${packageName}`],
  moduleDirectories: [`node_modules`, `test/${packageName}/node_modules`],
  id: packageName,
  displayName: packageName,
  rootDir: '../..'
}
