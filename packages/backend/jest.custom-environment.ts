import { TestEnvironment } from 'jest-environment-node'
import nock from 'nock'

export default class CustomEnvironment extends TestEnvironment {
  constructor(config, context) {
    super(config, context)
    this.global.nock = nock
  }
}
