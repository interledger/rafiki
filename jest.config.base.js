'use strict'

module.exports = {
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.build.json'
    }
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  preset: 'ts-jest',
  testEnvironment: 'node'
}
