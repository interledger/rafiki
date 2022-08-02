'use strict'

module.exports = {
  globals: {
    'ts-jest': {
      isolatedModules: true,
      tsconfig: 'tsconfig.build.json'
    }
  },
  transform: {
    '^.+\\.tsx?$': 'ts-jest'
  },
  preset: 'ts-jest',
  testEnvironment: 'node'
}
