// my-custom-environment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NodeEnvironment = require('jest-environment-node').TestEnvironment

// https://jestjs.io/docs/configuration/#testenvironment-string
class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context)
    this.testPath = context.testPath
    this.docblockPragmas = context.docblockPragmas
  }

  async setup() {
    await super.setup()
  }

  async teardown() {
    if (this.global['container']) {
      console.log('container defined, stopping container')
      await this.global.container.stop()
    }

    await super.teardown()
  }

  getVmContext() {
    return super.getVmContext()
  }

  async handleTestEvent(event, state) {
    if (event.name === 'test_start') {
      // ...
    }
  }
}

module.exports = CustomEnvironment
