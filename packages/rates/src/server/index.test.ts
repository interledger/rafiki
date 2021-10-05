import nock from 'nock'
import { createApp, shutdownApp } from '.'
import { config } from './config'
import { RATES_API } from './ecb/service'

describe('App', function () {
  afterEach(() => {
    nock.cleanAll()
  })

  it('starts and closes cleanly', async () => {
    const scope = nock(RATES_API)
      .get('')
      .replyWithFile(200, __dirname + '/fixtures/ecb-eurofxref-daily.xml', {
        'Content-Type': 'text/xml'
      })

    const app = await createApp(config)
    await shutdownApp(app)

    scope.done()
  })
})
