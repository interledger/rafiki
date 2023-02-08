// my-custom-environment
// eslint-disable-next-line @typescript-eslint/no-var-requires
const NodeEnvironment = require('jest-environment-node').TestEnvironment

// https://jestjs.io/docs/configuration/#testenvironment-string
class CustomEnvironment extends NodeEnvironment {
  constructor(config, context) {
    super(config, context)
    console.log(config.globalConfig)
    console.log(config.projectConfig)
    this.testPath = context.testPath
    this.docblockPragmas = context.docblockPragmas
  }

  async setup() {
    await super.setup()
    this.global.testVar = 'DEFINED'
    console.log(`SETUP: ${this.global.testVar}`)
  }

  async teardown() {
    console.log(`TEARDOWN: ${this.global.testVar}`)
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
