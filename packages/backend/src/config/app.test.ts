describe('Config', () => {
  const ilpAddress = process.env.ILP_ADDRESS

  afterEach(() => {
    process.env.ILP_ADDRESS = ilpAddress
  })

  function loadConfig() {
    let config: typeof import('./app').Config | undefined

    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      config = require('./app').Config
    })

    return config
  }

  describe('ILP_ADDRESS', () => {
    test.each(['test.rafiki', 'g.example.alice', 'test.local-playground-1b2c'])(
      'accepts the valid ILP address %s',
      (address) => {
        process.env.ILP_ADDRESS = address

        expect(loadConfig()?.ilpAddress).toBe(address)
      }
    )

    test.each([
      'invalid',
      'test',
      'test..rafiki',
      'test.raf iki',
      'TEST.rafiki',
      'test.rafiki.'
    ])('throws for the invalid ILP address "%s"', (address) => {
      process.env.ILP_ADDRESS = address

      expect(loadConfig).toThrow(
        `Environment variable ILP_ADDRESS must be a valid ILP address`
      )
    })

    test('throws when it is not set', () => {
      delete process.env.ILP_ADDRESS

      expect(loadConfig).toThrow(
        'Environment variable ILP_ADDRESS must be set.'
      )
    })
  })
})
