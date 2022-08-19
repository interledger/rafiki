'use strict'

module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: '<rootDir>/tsconfig.build.json'
    }
  },
  transform: {
    '^.+\\.tsx?$': ['@swc/jest']
  },
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', './'],
  modulePaths: ['node_modules', './']
}
